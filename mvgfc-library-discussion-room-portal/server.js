// server.ts
import "dotenv/config";
import crypto3 from "crypto";
import fs2 from "fs";
import express from "express";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// src/lib/reservationRules.ts
var DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
var CLASS_COLOR_TONES = [
  "sky",
  "amber",
  "sage",
  "cobalt",
  "navy",
  "peach",
  "gold"
];
function parseTimeToMinutes(hhmm) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return -1;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}
function formatMinutesTo24h(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function formatTime12h(hhmm) {
  const mins = parseTimeToMinutes(hhmm);
  if (mins < 0) return hhmm;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
function formatTimeRange12h(startTime, endTime) {
  return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
}
function formatDurationLabel(startTime, endTime) {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s < 0 || e <= s) return "";
  const hours = (e - s) / 60;
  if (hours === 0.5) return "30 mins";
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
function getDayOfWeekFromYmd(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  const jsDay = dt.getDay();
  if (jsDay === 0) return null;
  return DAYS_OF_WEEK[jsDay - 1] ?? null;
}
function formatYmdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function intervalsOverlap(aStart, aEnd, bStart, bEnd, bufferMinutes = 0) {
  return aStart < bEnd + bufferMinutes && bStart < aEnd + bufferMinutes;
}
function generateReferenceNumber(sequenceNumber, dateStr) {
  const year = dateStr && /^\d{4}/.test(dateStr) ? dateStr.slice(0, 4) : String((/* @__PURE__ */ new Date()).getFullYear());
  return `MVGFC-${year}-${String(sequenceNumber).padStart(4, "0")}`;
}
function schedulesMatchDayOrDate(a, b) {
  const aType = a.bookingType || "borrowing";
  const bType = b.bookingType || "borrowing";
  const aDay = a.dayOfWeek || (a.date ? getDayOfWeekFromYmd(a.date) : null);
  const bDay = b.dayOfWeek || (b.date ? getDayOfWeekFromYmd(b.date) : null);
  if (aType === "semester" && bType === "semester") {
    const sameTerm = !a.semesterTerm || !b.semesterTerm || a.semesterTerm === b.semesterTerm;
    return sameTerm && Boolean(aDay && bDay && aDay === bDay);
  }
  if (aType === "semester" || bType === "semester") {
    return Boolean(aDay && bDay && aDay === bDay);
  }
  return Boolean(a.date && b.date && a.date === b.date);
}
function findConfirmedConflicts(candidate, reservations, bufferMinutes = 0) {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];
  return reservations.filter((r) => {
    if (candidate.id && r.id === candidate.id) return false;
    if (r.status !== "Approved") return false;
    if (r.roomId !== candidate.roomId) return false;
    if (candidate.bookingType !== "semester" && r.bookingType !== "semester") return false;
    if (!schedulesMatchDayOrDate(candidate, r)) return false;
    const effectiveBuffer = candidate.bookingType === "semester" || r.bookingType === "semester" ? 0 : bufferMinutes;
    const rStart = parseTimeToMinutes(r.startTime);
    const rEnd = parseTimeToMinutes(r.endTime);
    return intervalsOverlap(cStart, cEnd, rStart, rEnd, effectiveBuffer);
  });
}
function findCompetingPendingRequests(candidate, reservations, bufferMinutes = 0) {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];
  return reservations.filter((r) => {
    if (candidate.id && r.id === candidate.id) return false;
    if (r.status !== "Pending" && r.status !== "Needs Information") return false;
    if (r.roomId !== candidate.roomId) return false;
    if (candidate.bookingType !== "semester" && r.bookingType !== "semester") return false;
    if (!schedulesMatchDayOrDate(candidate, r)) return false;
    const effectiveBuffer = candidate.bookingType === "semester" || r.bookingType === "semester" ? 0 : bufferMinutes;
    const rStart = parseTimeToMinutes(r.startTime);
    const rEnd = parseTimeToMinutes(r.endTime);
    return intervalsOverlap(cStart, cEnd, rStart, rEnd, effectiveBuffer);
  });
}
function findClosureConflicts(candidate, closures) {
  const cStart = parseTimeToMinutes(candidate.startTime);
  const cEnd = parseTimeToMinutes(candidate.endTime);
  if (cStart < 0 || cEnd <= cStart) return [];
  return closures.filter((c) => {
    if (c.roomId !== candidate.roomId) return false;
    if (candidate.bookingType === "semester") {
      const cDay = getDayOfWeekFromYmd(c.date);
      if (!cDay || cDay !== candidate.dayOfWeek) return false;
    } else if (c.date !== candidate.date) {
      return false;
    }
    const clStart = parseTimeToMinutes(c.startTime);
    const clEnd = parseTimeToMinutes(c.endTime);
    return intervalsOverlap(cStart, cEnd, clStart, clEnd, 0);
  });
}
function validateReservationRequest(input, room, settings, closures, existingReservations, now = /* @__PURE__ */ new Date()) {
  const errors = [];
  const warnings = [];
  const bookingType = input.bookingType === "semester" ? "semester" : "borrowing";
  if (!input.fullName?.trim()) errors.push("Full name is required.");
  if (input.requestorType !== "Student" && input.requestorType !== "Faculty") {
    errors.push("Requestor classification (Student or Faculty) is required.");
  }
  if (input.requestorType === "Student" && bookingType === "semester") {
    errors.push(
      "Students may only submit single-session borrowing requests. Whole semester class reservations are restricted to Faculty members."
    );
  }
  if (!input.idNumber?.trim()) errors.push("Student or Employee Number is required.");
  if (!input.department?.trim()) errors.push("Institute or Department is required.");
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.push("A valid institutional email address is required.");
  }
  if (!input.contactNumber?.trim() || input.contactNumber.trim().length < 7) {
    errors.push("A valid contact number is required.");
  }
  const startMins = parseTimeToMinutes(input.startTime || "");
  const endMins = parseTimeToMinutes(input.endTime || "");
  if (startMins < 0 || endMins < 0) {
    errors.push("Valid start and end times are required.");
  } else if (endMins <= startMins) {
    errors.push("End time must be later than start time.");
  } else {
    const durationMins = endMins - startMins;
    if (durationMins < 30) {
      errors.push("Minimum reservation duration is 30 minutes.");
    }
    const maxHours = bookingType === "semester" ? Math.max(settings.maxBookingHours, 6) : settings.maxBookingHours;
    if (durationMins > maxHours * 60) {
      errors.push(`Maximum booking duration is ${maxHours} hours per session.`);
    }
  }
  let resolvedDay = input.dayOfWeek;
  if (bookingType === "borrowing") {
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      errors.push("Preferred reservation date is required.");
    } else {
      const derivedDay = getDayOfWeekFromYmd(input.date);
      if (!derivedDay) {
        errors.push("MVGFC Library is closed on Sundays. Please select a Monday\u2013Saturday schedule.");
      } else {
        resolvedDay = derivedDay;
      }
    }
  } else {
    if (!input.dayOfWeek || !DAYS_OF_WEEK.includes(input.dayOfWeek)) {
      errors.push("Please select the weekly class day (Monday\u2013Saturday).");
    }
    if (!input.semesterTerm?.trim()) {
      errors.push("Please select the academic semester/term.");
    }
    if (!input.courseTitle?.trim() || input.courseTitle.trim().length < 2) {
      errors.push("Please enter the Course / Subject Title for the semester class.");
    }
  }
  if (!room) {
    errors.push("Please select a valid discussion room.");
  } else {
    if (!room.active || room.status === "Unavailable" || room.status === "Under Maintenance") {
      const reasonStatus = room.status === "Under Maintenance" ? "currently under maintenance" : "currently unavailable for new requests";
      errors.push(`${room.name} is ${reasonStatus}.`);
    }
    const effectiveCapacity = Math.max(2, Math.min(room.capacity, 50));
    if (input.participants < 1 || !Number.isFinite(input.participants)) {
      errors.push("Number of participants must be at least 1.");
    } else if (input.participants > effectiveCapacity) {
      errors.push(`${room.name} can only accommodate up to ${effectiveCapacity} persons.`);
    } else if (input.participants < room.minParticipants) {
      errors.push(`${room.name} requires at least ${room.minParticipants} participants.`);
    }
    const openMins = Math.max(parseTimeToMinutes(settings.openTime), parseTimeToMinutes(room.openTime));
    const closeMins = Math.min(parseTimeToMinutes(settings.closeTime), parseTimeToMinutes(room.closeTime));
    if (startMins >= 0 && endMins > startMins) {
      if (startMins < openMins || endMins > closeMins) {
        errors.push(
          `MVGFC Library is open only from ${formatTime12h(formatMinutesTo24h(openMins))} to ${formatTime12h(
            formatMinutesTo24h(closeMins)
          )}.`
        );
      }
    }
  }
  if (bookingType === "borrowing" && (!input.purpose?.trim() || input.purpose.trim().length < 5)) {
    errors.push("Please state the academic purpose of your borrowing request.");
  }
  if (bookingType === "borrowing" && input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && startMins >= 0) {
    const [y, m, d] = input.date.split("-").map(Number);
    const slotStartDate = new Date(y, m - 1, d, Math.floor(startMins / 60), startMins % 60, 0, 0);
    const diffMins = (slotStartDate.getTime() - now.getTime()) / 6e4;
    if (diffMins < -5) {
      errors.push("Reservations cannot be submitted for a past date or time.");
    } else if (diffMins < settings.minNoticeMinutes) {
      errors.push(`Requests require at least ${settings.minNoticeMinutes} minutes advance notice.`);
    }
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetMidnight = new Date(y, m - 1, d);
    const diffDays = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / 864e5);
    if (diffDays > settings.maxAdvanceDays) {
      errors.push(`Borrowing reservations may be requested up to ${settings.maxAdvanceDays} days in advance.`);
    }
  }
  if (room && startMins >= 0 && endMins > startMins && (bookingType === "semester" ? resolvedDay : input.date)) {
    const closureHits = findClosureConflicts(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        startTime: input.startTime,
        endTime: input.endTime
      },
      closures
    );
    if (closureHits.length > 0) {
      errors.push(`${room.name} is temporarily closed during this schedule (${closureHits[0].reason}).`);
    }
    const confirmedHits = findConfirmedConflicts(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        semesterTerm: input.semesterTerm,
        startTime: input.startTime,
        endTime: input.endTime
      },
      existingReservations,
      settings.bufferMinutes
    );
    if (confirmedHits.length > 0) {
      const hit = confirmedHits[0];
      const hitLabel = hit.bookingType === "semester" ? `confirmed semester class (${hit.courseTitle || "Class"} \xB7 ${hit.dayOfWeek} ${formatTimeRange12h(
        hit.startTime,
        hit.endTime
      )})` : `confirmed booking (${formatTimeRange12h(hit.startTime, hit.endTime)})`;
      errors.push(`This time slot conflicts with an already ${hitLabel}.`);
    }
    const pendingHits = findCompetingPendingRequests(
      {
        roomId: room.id,
        bookingType,
        date: input.date,
        dayOfWeek: resolvedDay,
        semesterTerm: input.semesterTerm,
        startTime: input.startTime,
        endTime: input.endTime
      },
      existingReservations,
      settings.bufferMinutes
    );
    if (pendingHits.length > 0) {
      warnings.push(
        `Note: There ${pendingHits.length === 1 ? "is 1 pending request" : `are ${pendingHits.length} pending requests`} overlapping this time slot. Library staff will review all requests in queue before confirming.`
      );
    }
  }
  if (!input.rulesAgreed) {
    errors.push("You must agree to the MVGFC Library Discussion Room Rules and Regulations before submitting.");
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
function buildEmailFromTemplate(trigger, reservation, settings, extra) {
  const timeRange = formatTimeRange12h(reservation.startTime, reservation.endTime);
  const scheduleSummary = reservation.bookingType === "semester" ? `Every ${reservation.dayOfWeek || ""} (${reservation.semesterTerm || settings.semesterLabel})` : reservation.date;
  const bookingTypeLabel = reservation.bookingType === "semester" ? `Semester Class (${reservation.courseTitle || reservation.purpose})` : "Single-Session Borrowing";
  switch (trigger) {
    case "new_submission_requestor":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Discussion Room Request Received (Pending Review) - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "We have received your discussion room reservation request. Please note that submission is not confirmation; your request is currently Pending Review by the MVGFC Library staff.",
          "",
          "Request Summary",
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange} (${formatDurationLabel(reservation.startTime, reservation.endTime)})`,
          `Participants: ${reservation.participants}`,
          "Current Status: Pending",
          "",
          'No account is needed to track this request\u2014use your Email and Reference Number in the "My Reservations" tab anytime.',
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "new_submission_admin":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: settings.monitoredEmail,
        recipientRole: "Library Administrator",
        subject: `[Action Required] New Discussion Room Request - ${reservation.referenceNumber}`,
        body: [
          "Library Administrator Alert,",
          "",
          "A new discussion room reservation request requires review in the MVGFC Library Staff Portal.",
          "",
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Requestor: ${reservation.fullName} (${reservation.requestorType} \xB7 ${reservation.department})`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          `Purpose: ${reservation.purpose}`,
          "",
          "Please verify room capacity, policy compliance, and schedule conflicts before approving or declining."
        ].join("\n")
      };
    case "approved":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: "Discussion Room Reservation Confirmed - MVGFC Library",
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "Your discussion room reservation request has been approved.",
          "",
          "Reservation Details",
          `Reference Number: ${reservation.referenceNumber}`,
          `Booking Type: ${bookingTypeLabel}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          "",
          "Please arrive on time and observe the MVGFC Library Discussion Room Rules and Regulations.",
          "",
          "For inquiries or concerns, kindly contact the MVGFC Library.",
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "rejected":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Discussion Room Request Declined - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "We regret to inform you that your discussion room reservation request could not be approved.",
          "",
          "Request Details",
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Reason: ${extra?.reason || reservation.adminNote || "Schedule conflict or policy restriction."}`,
          "",
          "Next Step: You may check available time slots on the schedule grid and submit a new request for an open room or schedule.",
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "needs_information":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Additional Information Needed - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "Your discussion room reservation request requires clarification or additional details before our library staff can finalize a decision.",
          "",
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary} (${timeRange})`,
          "",
          `Information Requested: ${extra?.infoPrompt || reservation.infoRequestPrompt || "Please verify your participant count and academic purpose."}`,
          "",
          'How to Respond: Open "My Reservations", enter your Email and Reference Number, and submit your response.',
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "cancelled":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Discussion Room Reservation Cancelled - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "Your discussion room reservation has been cancelled and the time slot is now released.",
          "",
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary} (${timeRange})`,
          `Reason: ${extra?.reason || reservation.cancellationReason || "Cancelled upon request."}`,
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "reminder":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Reminder: Upcoming Discussion Room Reservation Tomorrow - ${reservation.referenceNumber}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          "This is a friendly reminder of your confirmed MVGFC Library discussion room reservation scheduled for tomorrow.",
          "",
          `Reference Number: ${reservation.referenceNumber}`,
          `Room: ${reservation.roomName}`,
          `Schedule: ${scheduleSummary}`,
          `Time: ${timeRange}`,
          `Participants: ${reservation.participants}`,
          "",
          "Please check in at the Library Circulation Desk at least 5 minutes before your schedule.",
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
    case "waitlist_room_available":
      return {
        trigger,
        reservationId: reservation.id,
        referenceNumber: reservation.referenceNumber,
        recipientEmail: reservation.email,
        recipientRole: "Requestor",
        subject: `Room Now Available: ${reservation.roomName} - ${settings.libraryName}`,
        body: [
          `Dear ${reservation.fullName},`,
          "",
          `${reservation.roomName} is now marked Available for booking in the MVGFC Library Discussion Room Portal.`,
          "",
          "Thank you.",
          settings.libraryName,
          settings.institutionName
        ].join("\n")
      };
  }
}
function sanitizePublicSchedule(reservations, closures, rooms, dateFilter) {
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const blocks = [];
  const filterDay = dateFilter ? getDayOfWeekFromYmd(dateFilter) : null;
  for (const r of reservations) {
    const bType = r.bookingType === "semester" ? "semester" : "borrowing";
    const rDay = r.dayOfWeek || getDayOfWeekFromYmd(r.date);
    if (dateFilter) {
      if (bType === "semester") {
        if (!filterDay || rDay !== filterDay) continue;
      } else if (r.date !== dateFilter) {
        continue;
      }
    }
    if (r.status === "Approved" || r.status === "Completed") {
      blocks.push({
        id: `pub-${r.id}`,
        roomId: r.roomId,
        roomName: roomMap.get(r.roomId)?.name || r.roomName,
        bookingType: bType,
        date: r.date,
        dayOfWeek: rDay,
        semesterTerm: bType === "semester" ? r.semesterTerm : void 0,
        startTime: r.startTime,
        endTime: r.endTime,
        slotState: "Confirmed",
        // Official semester class schedules display course & instructor on the timetable (like the PDF);
        // Student/faculty personal borrowing NEVER exposes personal name, ID, email, or purpose.
        displayTitle: bType === "semester" ? (r.courseTitle || "SEMESTER CLASS").toUpperCase() : void 0,
        displaySubtitle: bType === "semester" ? (r.instructorName || r.fullName).toUpperCase() : void 0,
        colorTone: bType === "semester" ? r.colorTone || "sage" : void 0
      });
    } else if (r.status === "Pending" || r.status === "Needs Information") {
      blocks.push({
        id: `pub-${r.id}`,
        roomId: r.roomId,
        roomName: roomMap.get(r.roomId)?.name || r.roomName,
        bookingType: bType,
        date: r.date,
        dayOfWeek: rDay,
        semesterTerm: bType === "semester" ? r.semesterTerm : void 0,
        startTime: r.startTime,
        endTime: r.endTime,
        slotState: "Pending"
      });
    }
  }
  for (const c of closures) {
    if (dateFilter && c.date !== dateFilter) continue;
    blocks.push({
      id: `pub-closure-${c.id}`,
      roomId: c.roomId,
      roomName: roomMap.get(c.roomId)?.name || c.roomId,
      bookingType: "borrowing",
      date: c.date,
      dayOfWeek: getDayOfWeekFromYmd(c.date),
      startTime: c.startTime,
      endTime: c.endTime,
      slotState: "Closed",
      closureReason: c.reason
    });
  }
  return blocks.sort((a, b) => a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date));
}
function computeUtilizationReport(reservations, rooms) {
  const byStatus = {
    Pending: 0,
    Approved: 0,
    Rejected: 0,
    "Needs Information": 0,
    Cancelled: 0,
    Completed: 0,
    "No-show": 0
  };
  const roomStats = /* @__PURE__ */ new Map();
  for (const room of rooms) {
    roomStats.set(room.id, {
      roomId: room.id,
      roomName: room.name,
      confirmedCount: 0,
      completedCount: 0,
      bookedMinutes: 0
    });
  }
  const slotCounts = /* @__PURE__ */ new Map();
  const deptCounts = /* @__PURE__ */ new Map();
  for (const r of reservations) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const deptEntry = deptCounts.get(r.department) || { total: 0, approvedOrCompleted: 0 };
    deptEntry.total += 1;
    if (r.status === "Approved" || r.status === "Completed") {
      deptEntry.approvedOrCompleted += 1;
    }
    deptCounts.set(r.department, deptEntry);
    if (r.status === "Approved" || r.status === "Completed") {
      const slotLabel = formatTimeRange12h(r.startTime, r.endTime);
      slotCounts.set(slotLabel, (slotCounts.get(slotLabel) || 0) + 1);
      const rs = roomStats.get(r.roomId);
      if (rs) {
        if (r.status === "Approved") rs.confirmedCount += 1;
        if (r.status === "Completed") rs.completedCount += 1;
        const mins = Math.max(0, parseTimeToMinutes(r.endTime) - parseTimeToMinutes(r.startTime));
        rs.bookedMinutes += mins;
      }
    }
  }
  const decidedConfirmedDenominator = byStatus.Approved + byStatus.Completed + byStatus.Cancelled + byStatus["No-show"];
  const cancellationRatePercent = reservations.length > 0 ? Math.round(byStatus.Cancelled / reservations.length * 100) : 0;
  const noShowRatePercent = decidedConfirmedDenominator > 0 ? Math.round(byStatus["No-show"] / decidedConfirmedDenominator * 100) : 0;
  return {
    totalRequests: reservations.length,
    byStatus,
    roomUtilization: Array.from(roomStats.values()).map((rs) => ({
      roomId: rs.roomId,
      roomName: rs.roomName,
      confirmedCount: rs.confirmedCount,
      completedCount: rs.completedCount,
      bookedHours: Math.round(rs.bookedMinutes / 60 * 10) / 10
    })),
    popularTimeSlots: Array.from(slotCounts.entries()).map(([slotLabel, count]) => ({ slotLabel, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    byDepartment: Array.from(deptCounts.entries()).map(([department, counts]) => ({ department, ...counts })).sort((a, b) => b.total - a.total),
    cancellationRatePercent,
    noShowRatePercent
  };
}
var DEFAULT_EMAIL_ATTEMPT_LIMIT = 3;
function sanitizeEmailHeader(value) {
  return String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
}
function normalizeEmailKey(email) {
  return String(email ?? "").trim().toLowerCase();
}
function computeEmailQuota(usedAttempts, limit = DEFAULT_EMAIL_ATTEMPT_LIMIT) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeUsed = Math.max(0, Math.floor(usedAttempts));
  return {
    used: safeUsed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed)
  };
}
function parseCheckInScanInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase().startsWith("MVGFC-CHECKIN|")) {
    const parts = trimmed.split("|");
    const ref = (parts[1] || "").trim().toUpperCase();
    if (/^MVGFC-\d{4}-\d{4,}$/.test(ref)) {
      return { referenceNumber: ref, isQrPayload: true };
    }
    return null;
  }
  const refMatch = trimmed.toUpperCase().match(/\bMVGFC-\d{4}-\d{4,}\b/);
  if (refMatch) {
    return { referenceNumber: refMatch[0], isQrPayload: false };
  }
  return null;
}
function buildStaffCancellationNotification(reservation, previousStatus, reason, enabled, createdAt, id) {
  if (!enabled) return null;
  const scheduleLabel = reservation.bookingType === "semester" ? `Every ${reservation.dayOfWeek || ""}` : reservation.date;
  const timeRange = formatTimeRange12h(reservation.startTime, reservation.endTime);
  const cleanReason = reason.trim() || "Cancelled by requestor";
  return {
    id,
    type: "request_cancelled",
    reservationId: reservation.id,
    referenceNumber: reservation.referenceNumber,
    title: `${reservation.requestorType} Cancelled ${previousStatus} Request \u2014 ${reservation.referenceNumber}`,
    message: `${reservation.fullName} cancelled ${reservation.roomName} (${scheduleLabel}, ${timeRange}). Reason: ${cleanReason}`,
    actorName: reservation.fullName,
    createdAt,
    read: false
  };
}
function canSessionManageStaff(params) {
  if (params.authMethod === "passcode" || params.adminId === "adm-env-override") {
    return true;
  }
  if (!params.envPasscodeConfigured && params.adminId && params.primaryAdminId && params.adminId === params.primaryAdminId) {
    return true;
  }
  return false;
}
function validateNewStaffAccountInput(input, existingEmails) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const staffTitle = (input.staffTitle || "").trim() || "Library Staff";
  const password = input.password;
  if (fullName.length < 2) {
    return { valid: false, error: "Staff member full name must be at least 2 characters." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: "Please enter a valid library staff email address." };
  }
  if (password.length < 6) {
    return { valid: false, error: "Staff password must be at least 6 characters." };
  }
  const taken = existingEmails.some((existing) => existing.trim().toLowerCase() === email);
  if (taken) {
    return { valid: false, error: "A library staff account with this email already exists." };
  }
  return {
    valid: true,
    normalized: { fullName, email, staffTitle, password }
  };
}

// src/lib/enterpriseRules.ts
var ALLOWED_ROOM_STATUSES = ["Available", "Unavailable", "Under Maintenance"];
var GUIDELINE_CATEGORIES = [
  "Eligibility",
  "Time Limits",
  "Confirmation",
  "Conduct & Cancellations",
  "Facilities & Safety"
];
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
function validateRoomUpdateInput(input) {
  if (input.name !== void 0 && input.name.trim().length < 2) {
    return { valid: false, error: "Room name must be at least 2 characters." };
  }
  if (input.capacity !== void 0) {
    if (!Number.isFinite(input.capacity) || input.capacity < 2 || input.capacity > 50) {
      return { valid: false, error: "Room capacity must be between 2 and 50 persons." };
    }
  }
  if (input.minParticipants !== void 0) {
    if (!Number.isFinite(input.minParticipants) || input.minParticipants < 1 || input.minParticipants > 50) {
      return { valid: false, error: "Minimum participants must be between 1 and 50." };
    }
    if (input.capacity !== void 0 && input.minParticipants > input.capacity) {
      return { valid: false, error: "Minimum participants cannot exceed maximum room capacity." };
    }
  }
  if (input.status !== void 0 && !ALLOWED_ROOM_STATUSES.includes(input.status)) {
    return { valid: false, error: "Room status must be Available, Unavailable, or Under Maintenance." };
  }
  if (input.openTime !== void 0 && parseTimeToMinutes(input.openTime) < 0) {
    return { valid: false, error: "Invalid room opening time." };
  }
  if (input.closeTime !== void 0 && parseTimeToMinutes(input.closeTime) < 0) {
    return { valid: false, error: "Invalid room closing time." };
  }
  if (input.openTime !== void 0 && input.closeTime !== void 0) {
    if (parseTimeToMinutes(input.closeTime) <= parseTimeToMinutes(input.openTime)) {
      return { valid: false, error: "Room closing time must be later than opening time." };
    }
  }
  return { valid: true };
}
function validateImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || "").trim());
  if (!match) {
    return { valid: false, error: "Please upload a valid PNG, JPEG, or WebP image file." };
  }
  const mimeType = match[1];
  const base64 = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    return { valid: false, error: "Uploaded image file is empty." };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { valid: false, error: "Image size must not exceed 2 MB." };
  }
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return { valid: true, mimeType, extension, buffer };
}
function validateRuleInput(input) {
  const title = (input.title || "").trim();
  const content = (input.content || "").trim();
  if (title.length < 3) {
    return { valid: false, error: "Rule title must be at least 3 characters." };
  }
  if (content.length < 10) {
    return { valid: false, error: "Rule description must be at least 10 characters." };
  }
  return { valid: true, normalized: { title, content } };
}
function validateGuidelineInput(input) {
  const title = (input.title || "").trim();
  const description = (input.description || "").trim();
  const category = GUIDELINE_CATEGORIES.includes(input.category) ? input.category : "Eligibility";
  const instructions = (input.instructions || []).map((s) => s.trim()).filter(Boolean);
  if (title.length < 3) {
    return { valid: false, error: "Guideline title must be at least 3 characters." };
  }
  if (description.length < 5) {
    return { valid: false, error: "Guideline description must be at least 5 characters." };
  }
  if (instructions.length === 0) {
    return { valid: false, error: "Please include at least one instruction bullet." };
  }
  return {
    valid: true,
    normalized: { title, category, description, instructions }
  };
}
function reorderOrderedItems(items, orderedIds) {
  const map = new Map(items.map((item) => [item.id, item]));
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const id of orderedIds) {
    const found = map.get(id);
    if (found && !seen.has(id)) {
      seen.add(id);
      result.push({ ...found, order: result.length + 1 });
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      result.push({ ...item, order: result.length + 1 });
    }
  }
  return result;
}
function validateContactSettingsInput(input) {
  if (input.monitoredEmail !== void 0) {
    const email = input.monitoredEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { valid: false, error: "Please enter a valid primary institutional email address." };
    }
  }
  if (input.contactPhone !== void 0 && input.contactPhone.trim().length < 5) {
    return { valid: false, error: "Please enter a valid primary contact phone number." };
  }
  if (input.libraryLocation !== void 0 && input.libraryLocation.trim().length < 4) {
    return { valid: false, error: "Please provide the library / office address." };
  }
  if (input.deskHours !== void 0 && input.deskHours.trim().length < 4) {
    return { valid: false, error: "Please provide operating hours." };
  }
  if (input.additionalContacts) {
    for (const c of input.additionalContacts) {
      if (!c.label || c.label.trim().length < 2) {
        return { valid: false, error: "Each additional contact desk must have a label." };
      }
      if (c.email && c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) {
        return { valid: false, error: `Invalid email format for "${c.label}".` };
      }
    }
  }
  return { valid: true };
}

// src/lib/waitlistRules.ts
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isRoomUnavailableForWaitlist(room) {
  const status = room.status || (room.active ? "Available" : "Unavailable");
  return !room.active || status !== "Available";
}
function didRoomTransitionToAvailable(previous, next) {
  return isRoomUnavailableForWaitlist(previous) && !isRoomUnavailableForWaitlist(next);
}
function validateWaitlistSignupInput(input, room) {
  if (!room) {
    return { valid: false, error: "Selected discussion room was not found." };
  }
  if (!isRoomUnavailableForWaitlist(room)) {
    return {
      valid: false,
      error: `${room.name} is currently Available and open for booking directly without joining a waitlist.`
    };
  }
  const email = normalizeEmailKey(input.email || "");
  if (!email || email.length > 160 || !EMAIL_RE.test(email)) {
    return { valid: false, error: "Please enter a valid institutional email address." };
  }
  const trimmedName = (input.fullName || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    valid: true,
    email,
    fullName: trimmedName || void 0
  };
}
function hasActiveWaitlistEntry(waitlist, roomId, email) {
  const normalized = normalizeEmailKey(email);
  return waitlist.some(
    (entry) => entry.roomId === roomId && entry.status === "waiting" && normalizeEmailKey(entry.email) === normalized
  );
}
function buildWaitlistAvailableEmail(entry, room, settings) {
  const safeRoomName = sanitizeEmailHeader(room.name);
  const safeLibrary = sanitizeEmailHeader(settings.libraryName);
  const safeRecipient = sanitizeEmailHeader(entry.email);
  const greetingName = entry.fullName ? sanitizeEmailHeader(entry.fullName) : "Library User";
  const capacity = Math.max(2, Math.min(room.capacity || 10, 50));
  const locationParts = [room.building, room.floor, room.locationDetail].filter(Boolean).join(" \xB7 ");
  return {
    trigger: "waitlist_room_available",
    reservationId: entry.id,
    referenceNumber: `WAITLIST-${room.code || room.id.toUpperCase()}`,
    recipientEmail: safeRecipient,
    recipientRole: "Requestor",
    subject: `Room Now Available: ${safeRoomName} - ${safeLibrary}`,
    body: [
      `Dear ${greetingName},`,
      "",
      `Good news! ${room.name} (${room.code}) has just been marked Available for reservation by library staff.`,
      "",
      "Room Summary",
      `Room: ${room.name} (${room.code})`,
      `Capacity: ${room.minParticipants}\u2013${capacity} participants`,
      `Location: ${locationParts || settings.libraryLocation}`,
      `Operating Hours: ${formatTimeRange12h(room.openTime, room.closeTime)}`,
      "",
      "Next Step: Visit the MVGFC Library Discussion Room Portal to inspect the weekly timetable and submit your reservation request.",
      "",
      "Thank you.",
      settings.libraryName,
      settings.institutionName
    ].join("\n")
  };
}

// server/auth.ts
import crypto from "crypto";
var RUNTIME_SIGNING_KEY = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, "hex");
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}
function verifyEnvPasscode(candidate, envPasscode) {
  if (!candidate || !envPasscode) return false;
  const candHash = crypto.createHash("sha256").update(candidate).digest();
  const envHash = crypto.createHash("sha256").update(envPasscode).digest();
  return crypto.timingSafeEqual(candHash, envHash);
}
function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(input) {
  const padLen = (4 - input.length % 4) % 4;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}
function signSessionToken(payload, ttlSeconds = 60 * 60 * 12) {
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1e3) + ttlSeconds
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", RUNTIME_SIGNING_KEY).update(`${header}.${body}`).digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}
function verifySessionToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac("sha256", RUNTIME_SIGNING_KEY).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body));
    if (!decoded.sub || !decoded.role || !decoded.exp) return null;
    if (decoded.exp < Math.floor(Date.now() / 1e3)) return null;
    return decoded;
  } catch {
    return null;
  }
}

// server/mailer.ts
import nodemailer from "nodemailer";

// server/store.ts
import crypto2 from "crypto";
import fs from "fs";
import path from "path";
var DATA_DIR = path.resolve(process.cwd(), ".data");
var DB_FILE = path.join(DATA_DIR, "portal-db.json");
var ROOM_UPLOADS_DIR = path.resolve(DATA_DIR, "uploads", "rooms");
function createSeedRules(nowIso) {
  return [
    {
      id: "rule-seed-1",
      title: "Operating Hours & Window",
      content: "Discussion rooms operate Monday to Saturday from 8:00 AM to 5:00 PM. All sessions must vacate promptly at closing or upon slot end.",
      order: 1,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "rule-seed-2",
      title: "Eligible Group Size & Purpose",
      content: "Rooms accommodate only up to their posted capacity (up to 10 persons by default) and are reserved exclusively for academic group study, thesis collaboration, or scheduled faculty classes.",
      order: 2,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "rule-seed-3",
      title: "Arrival Check-In & 15-Minute Grace Period",
      content: "Present your Reference Number QR pass and valid MVGFC ID at the Circulation Desk upon arrival. Unclaimed bookings 15 minutes past start time may be marked No-show and released.",
      order: 3,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "rule-seed-4",
      title: "Room Conduct & Care of Facilities",
      content: "Food, open beverages, and disruptive noise outside glass-walled rooms are not permitted. Erase whiteboards and arrange chairs neatly before leaving.",
      order: 4,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    }
  ];
}
function createSeedGuidelines(nowIso) {
  return [
    {
      id: "gdl-seed-1",
      title: "01. Eligibility & Allowed Use",
      category: "Eligibility",
      description: "Who may request library discussion rooms and permissible booking modes.",
      instructions: [
        "Open to currently enrolled MVGFC students and active faculty members with valid institutional IDs.",
        "Students may submit single-session borrowing requests only. Whole semester class reservations are restricted to Faculty members.",
        "Rooms are strictly intended for academic group study, thesis/capstone collaboration, and faculty consultations."
      ],
      order: 1,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "gdl-seed-2",
      title: "02. Time Limits & Booking Window",
      category: "Time Limits",
      description: "Operating hours, maximum session lengths, and advance notice rules.",
      instructions: [
        "Standard library operating hours run Monday through Saturday, 8:00 AM \u2013 5:00 PM.",
        "Single-session borrowing is capped at the configured maximum hours per booking; Faculty semester schedules follow plotted class periods.",
        "Requests require advance notice prior to session start and may be filed within the configured booking window."
      ],
      order: 2,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "gdl-seed-3",
      title: "03. Approval & Confirmation Rule",
      category: "Confirmation",
      description: "How requests move from Pending Review to Confirmed with a desk QR pass.",
      instructions: [
        "No account is required\u2014submitting the request form issues a Reference Number and sets status to Pending Review.",
        "Official confirmation is sent only after authorized library staff verify capacity, policy compliance, and schedule conflicts.",
        "Present your Reference Number QR Pass and institutional ID at the Circulation Desk upon arrival."
      ],
      order: 3,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    },
    {
      id: "gdl-seed-4",
      title: "04. Cancellations & No-Show Policy",
      category: "Conduct & Cancellations",
      description: "Releasing unused slots and maintaining fair access for all groups.",
      instructions: [
        "If your group no longer needs the room, cancel promptly through My Reservations using your email and reference number.",
        "Confirmed bookings unclaimed 15 minutes past scheduled start may be marked No-show and reassigned to waiting groups.",
        "Food, open beverages, and loud disruption outside glass-walled rooms are prohibited."
      ],
      order: 4,
      published: true,
      updatedAt: nowIso,
      updatedBy: "MVGFC Library Administration"
    }
  ];
}
function nextOpenDay(base, minOffsetDays) {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + minOffsetDays);
  while (dt.getDay() === 0) {
    dt.setDate(dt.getDate() + (minOffsetDays < 0 ? -1 : 1));
  }
  return formatYmdLocal(dt);
}
function createInitialSeedDatabase() {
  const now = /* @__PURE__ */ new Date();
  const today = nextOpenDay(now, 0);
  const tomorrow = nextOpenDay(now, 1);
  const dayAfter = nextOpenDay(now, 2);
  const yesterday = nextOpenDay(now, -1);
  const settings = {
    libraryName: "MVGFC Library",
    institutionName: "Manuel V. Gallego Foundation Colleges",
    openTime: "08:00",
    closeTime: "17:00",
    maxBookingHours: 4,
    minNoticeMinutes: 30,
    maxAdvanceDays: 14,
    bufferMinutes: 0,
    semesterLabel: "First Semester A.Y. 2025-2026",
    monitoredEmail: "library@mvgfc.edu.ph",
    contactPhone: "(044) 463-1122 loc. 204",
    libraryLocation: "2nd Floor, Main Academic Building, Cabanatuan City",
    deskHours: "Monday \u2013 Saturday \xB7 8:00 AM \u2013 5:00 PM",
    contactDescription: "Reach out to MVGFC Library personnel for urgent booking adjustments, technical equipment assistance, or reservation status inquiries.",
    additionalContacts: [
      {
        id: "cnt-seed-1",
        label: "Circulation & Reserve Desk",
        phone: "(044) 463-1122 loc. 204",
        email: "circulation@mvgfc.edu.ph",
        hours: "Mon \u2013 Sat \xB7 8:00 AM \u2013 5:00 PM",
        description: "Handles QR check-in passes, room keys, and same-day schedule releases."
      }
    ],
    notifyStaffOnCancellation: true
  };
  const rooms = [
    {
      id: "room-a",
      name: "Discussion Room A (Room 1)",
      code: "DR-A \xB7 Room 1",
      building: "Main Academic Building",
      floor: "2nd Floor \xB7 East Wing",
      locationDetail: "Near General Reference Collection",
      roomType: "Study Group Room",
      capacity: 6,
      minParticipants: 3,
      active: true,
      status: "Available",
      openTime: "08:00",
      closeTime: "17:00",
      amenities: ["Whiteboard & Markers", "Power Outlets", "Acoustic Glass"],
      description: "Compact collaboration room suited for case studies, peer tutoring, and small group project reviews.",
      additionalInstructions: "Keep glass blinds open during active student study sessions.",
      imageKey: "small"
    },
    {
      id: "room-b",
      name: "Discussion Room B (Room 2)",
      code: "DR-B \xB7 Room 2",
      building: "Main Academic Building",
      floor: "2nd Floor \xB7 Media Zone",
      locationDetail: "Adjacent to Multimedia Counter",
      roomType: "Seminar Room",
      capacity: 10,
      minParticipants: 4,
      active: true,
      status: "Available",
      openTime: "08:00",
      closeTime: "17:00",
      amenities: ["HDMI Presentation Monitor", "Whiteboard & Markers", "Conference Table"],
      description: "Larger seminar room equipped for thesis defense rehearsals, faculty consultations, and group presentations.",
      additionalInstructions: "Borrow HDMI adapter at the Circulation Desk before session start if needed.",
      imageKey: "seminar"
    },
    {
      id: "room-c",
      name: "Discussion Room C (Room 3)",
      code: "DR-C \xB7 Room 3",
      building: "Main Academic Building",
      floor: "2nd Floor \xB7 Quiet Research Wing",
      locationDetail: "North Corner Study Area",
      roomType: "Research & Class Room",
      capacity: 10,
      minParticipants: 3,
      active: true,
      status: "Available",
      openTime: "08:00",
      closeTime: "17:00",
      amenities: ["HDMI Projector", "Tabletop Power Strip", "Whiteboard & Markers"],
      description: "Dedicated research, capstone, and scheduled semester class discussion room.",
      additionalInstructions: "Power down the ceiling projector and lock screen remote after class.",
      imageKey: "research"
    }
  ];
  const closures = [
    {
      id: "closure-seed-1",
      roomId: "room-b",
      date: dayAfter,
      startTime: "13:00",
      endTime: "17:00",
      reason: "Scheduled Library Inventory & Lighting Maintenance",
      createdBy: "MVGFC Library Administration",
      createdAt: new Date(now.getTime() - 864e5).toISOString()
    }
  ];
  const semesterTerm = settings.semesterLabel;
  const reservations = [
    // --- Sample Borrowing Requests ---
    {
      id: "res-seed-1",
      referenceNumber: "MVGFC-2026-0001",
      ownerUserId: "clarisse.mendoza@mvgfc.edu.ph",
      fullName: "Clarisse Mendoza",
      requestorType: "Student",
      idNumber: "2024-01184",
      department: "College of Nursing",
      email: "clarisse.mendoza@mvgfc.edu.ph",
      contactNumber: "0917-555-0142",
      bookingType: "borrowing",
      date: today,
      dayOfWeek: getDayOfWeekFromYmd(today) || "Monday",
      startTime: "09:00",
      endTime: "11:00",
      roomId: "room-a",
      roomName: "Discussion Room A (Room 1)",
      participants: 5,
      purpose: "Maternal and Child Nursing clinical case presentation preparation",
      equipment: [],
      specialRequests: "Requesting extra dry-erase markers if available.",
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Circulation Desk",
      reviewedAt: new Date(now.getTime() - 432e5).toISOString(),
      createdAt: new Date(now.getTime() - 864e5).toISOString(),
      updatedAt: new Date(now.getTime() - 432e5).toISOString(),
      auditTrail: [
        {
          id: "aud-1",
          timestamp: new Date(now.getTime() - 864e5).toISOString(),
          actorName: "Clarisse Mendoza",
          actorRole: "Requestor",
          action: "Submitted borrowing request",
          toStatus: "Pending"
        },
        {
          id: "aud-2",
          timestamp: new Date(now.getTime() - 432e5).toISOString(),
          actorName: "Circulation Desk",
          actorRole: "Library Admin",
          action: "Approved reservation after schedule conflict check",
          fromStatus: "Pending",
          toStatus: "Approved"
        }
      ]
    },
    {
      id: "res-seed-2",
      referenceNumber: "MVGFC-2026-0002",
      ownerUserId: "e.villanueva@mvgfc.edu.ph",
      fullName: "Prof. Ernesto Villanueva",
      requestorType: "Faculty",
      idNumber: "FAC-0089",
      department: "College of Business & Accountancy",
      email: "e.villanueva@mvgfc.edu.ph",
      contactNumber: "0918-555-0193",
      bookingType: "borrowing",
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || "Tuesday",
      startTime: "10:00",
      endTime: "12:00",
      roomId: "room-b",
      roomName: "Discussion Room B (Room 2)",
      participants: 8,
      purpose: "Feasibility study advising and mock defense dry run",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Circulation Desk",
      reviewedAt: new Date(now.getTime() - 216e5).toISOString(),
      createdAt: new Date(now.getTime() - 72e6).toISOString(),
      updatedAt: new Date(now.getTime() - 216e5).toISOString(),
      auditTrail: [
        {
          id: "aud-3",
          timestamp: new Date(now.getTime() - 72e6).toISOString(),
          actorName: "Prof. Ernesto Villanueva",
          actorRole: "Requestor",
          action: "Submitted borrowing request",
          toStatus: "Pending"
        },
        {
          id: "aud-4",
          timestamp: new Date(now.getTime() - 216e5).toISOString(),
          actorName: "Circulation Desk",
          actorRole: "Library Admin",
          action: "Approved reservation",
          fromStatus: "Pending",
          toStatus: "Approved"
        }
      ]
    },
    {
      id: "res-seed-3",
      referenceNumber: "MVGFC-2026-0003",
      ownerUserId: "rafael.aquino@mvgfc.edu.ph",
      fullName: "Rafael Aquino",
      requestorType: "Student",
      idNumber: "2023-00412",
      department: "College of Engineering & Technology",
      email: "rafael.aquino@mvgfc.edu.ph",
      contactNumber: "0919-555-0177",
      bookingType: "borrowing",
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || "Tuesday",
      startTime: "14:00",
      endTime: "16:00",
      roomId: "room-a",
      roomName: "Discussion Room A (Room 1)",
      participants: 4,
      purpose: "Capstone system architecture review and documentation sprint",
      equipment: [],
      rulesAgreed: true,
      status: "Pending",
      createdAt: new Date(now.getTime() - 72e5).toISOString(),
      updatedAt: new Date(now.getTime() - 72e5).toISOString(),
      auditTrail: [
        {
          id: "aud-5",
          timestamp: new Date(now.getTime() - 72e5).toISOString(),
          actorName: "Rafael Aquino",
          actorRole: "Requestor",
          action: "Submitted borrowing request",
          toStatus: "Pending"
        }
      ]
    },
    {
      id: "res-seed-4",
      referenceNumber: "MVGFC-2026-0004",
      ownerUserId: "alyssa.pangilinan@mvgfc.edu.ph",
      fullName: "Alyssa Pangilinan",
      requestorType: "Student",
      idNumber: "2024-02219",
      department: "College of Teacher Education",
      email: "alyssa.pangilinan@mvgfc.edu.ph",
      contactNumber: "0920-555-0129",
      bookingType: "borrowing",
      date: tomorrow,
      dayOfWeek: getDayOfWeekFromYmd(tomorrow) || "Tuesday",
      startTime: "14:30",
      endTime: "16:00",
      roomId: "room-a",
      roomName: "Discussion Room A (Room 1)",
      participants: 5,
      purpose: "Lesson planning demonstration practice for Field Study 2",
      equipment: [],
      rulesAgreed: true,
      status: "Pending",
      createdAt: new Date(now.getTime() - 36e5).toISOString(),
      updatedAt: new Date(now.getTime() - 36e5).toISOString(),
      auditTrail: [
        {
          id: "aud-6",
          timestamp: new Date(now.getTime() - 36e5).toISOString(),
          actorName: "Alyssa Pangilinan",
          actorRole: "Requestor",
          action: "Submitted borrowing request",
          toStatus: "Pending"
        }
      ]
    },
    {
      id: "res-seed-5",
      referenceNumber: "MVGFC-2026-0005",
      ownerUserId: "jericho.bautista@mvgfc.edu.ph",
      fullName: "Jericho Bautista",
      requestorType: "Student",
      idNumber: "2025-00871",
      department: "College of Criminal Justice Education",
      email: "jericho.bautista@mvgfc.edu.ph",
      contactNumber: "0917-555-0166",
      bookingType: "borrowing",
      date: dayAfter,
      dayOfWeek: getDayOfWeekFromYmd(dayAfter) || "Wednesday",
      startTime: "09:00",
      endTime: "11:00",
      roomId: "room-b",
      roomName: "Discussion Room B (Room 2)",
      participants: 6,
      purpose: "Criminology research methodology group discussion",
      equipment: [],
      rulesAgreed: true,
      status: "Needs Information",
      infoRequestPrompt: "Please specify your thesis adviser name or course code for Room B booking.",
      createdAt: new Date(now.getTime() - 18e6).toISOString(),
      updatedAt: new Date(now.getTime() - 108e5).toISOString(),
      auditTrail: [
        {
          id: "aud-7",
          timestamp: new Date(now.getTime() - 18e6).toISOString(),
          actorName: "Jericho Bautista",
          actorRole: "Requestor",
          action: "Submitted borrowing request",
          toStatus: "Pending"
        },
        {
          id: "aud-8",
          timestamp: new Date(now.getTime() - 108e5).toISOString(),
          actorName: "Circulation Desk",
          actorRole: "Library Admin",
          action: "Requested additional information",
          fromStatus: "Pending",
          toStatus: "Needs Information",
          note: "Please specify your thesis adviser name or course code."
        }
      ]
    },
    {
      id: "res-seed-6",
      referenceNumber: "MVGFC-2026-0006",
      ownerUserId: "patricia.soriano@mvgfc.edu.ph",
      fullName: "Patricia Soriano",
      requestorType: "Student",
      idNumber: "2023-00765",
      department: "College of Nursing",
      email: "patricia.soriano@mvgfc.edu.ph",
      contactNumber: "0917-555-0115",
      bookingType: "borrowing",
      date: yesterday,
      dayOfWeek: getDayOfWeekFromYmd(yesterday) || "Monday",
      startTime: "13:00",
      endTime: "15:00",
      roomId: "room-a",
      roomName: "Discussion Room A (Room 1)",
      participants: 5,
      purpose: "Community health nursing survey data coding",
      equipment: [],
      rulesAgreed: true,
      status: "Completed",
      reviewedBy: "Circulation Desk",
      reviewedAt: new Date(now.getTime() - 1728e5).toISOString(),
      createdAt: new Date(now.getTime() - 2592e5).toISOString(),
      updatedAt: new Date(now.getTime() - 864e5).toISOString(),
      auditTrail: [
        {
          id: "aud-9",
          timestamp: new Date(now.getTime() - 864e5).toISOString(),
          actorName: "Circulation Desk",
          actorRole: "Library Admin",
          action: "Marked reservation as Completed after check-in",
          fromStatus: "Approved",
          toStatus: "Completed"
        }
      ]
    },
    // --- Confirmed Semester Class Schedule (Room 3 / Discussion Room C, matching PDF) ---
    {
      id: "res-sem-1",
      referenceNumber: "MVGFC-2026-0007",
      ownerUserId: "a.sevilla@mvgfc.edu.ph",
      fullName: "Arnel A. Sevilla",
      requestorType: "Faculty",
      idNumber: "FAC-0041",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "a.sevilla@mvgfc.edu.ph",
      contactNumber: "0917-555-0201",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Monday",
      semesterTerm,
      courseTitle: "IS CAPSTONE PROJECT 2",
      instructorName: "SEVILLA, ARNEL A.",
      colorTone: "sky",
      startTime: "09:00",
      endTime: "12:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 9,
      purpose: "IS CAPSTONE PROJECT 2 \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-2",
      referenceNumber: "MVGFC-2026-0008",
      ownerUserId: "jc.azarcon@mvgfc.edu.ph",
      fullName: "John Carlo Azarcon",
      requestorType: "Faculty",
      idNumber: "FAC-0042",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "jc.azarcon@mvgfc.edu.ph",
      contactNumber: "0917-555-0202",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Monday",
      semesterTerm,
      courseTitle: "WEB DEVELOPMENT APPLICATION 1",
      instructorName: "AZARCON, JOHN CARLO",
      colorTone: "cobalt",
      startTime: "13:30",
      endTime: "16:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 10,
      purpose: "WEB DEVELOPMENT APPLICATION 1 \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-3",
      referenceNumber: "MVGFC-2026-0009",
      ownerUserId: "iict.faculty@mvgfc.edu.ph",
      fullName: "IICT Full Time Faculty",
      requestorType: "Faculty",
      idNumber: "FAC-0043",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "iict.faculty@mvgfc.edu.ph",
      contactNumber: "0917-555-0203",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Tuesday",
      semesterTerm,
      courseTitle: "PROFESSIONAL ISSUE IN INFORMATION SYSTEMS",
      instructorName: "IICT FULL TIME FACULTY",
      colorTone: "amber",
      startTime: "09:00",
      endTime: "12:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 10,
      purpose: "PROFESSIONAL ISSUE IN INFORMATION SYSTEMS \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-4",
      referenceNumber: "MVGFC-2026-0010",
      ownerUserId: "jc.azarcon@mvgfc.edu.ph",
      fullName: "John Carlo Azarcon",
      requestorType: "Faculty",
      idNumber: "FAC-0042",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "jc.azarcon@mvgfc.edu.ph",
      contactNumber: "0917-555-0202",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Tuesday",
      semesterTerm,
      courseTitle: "XML WEB BASED APPLICATION",
      instructorName: "AZARCON, JOHN CARLO",
      colorTone: "gold",
      startTime: "13:00",
      endTime: "15:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 9,
      purpose: "XML WEB BASED APPLICATION \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-5",
      referenceNumber: "MVGFC-2026-0011",
      ownerUserId: "jc.azarcon@mvgfc.edu.ph",
      fullName: "John Carlo Azarcon",
      requestorType: "Faculty",
      idNumber: "FAC-0042",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "jc.azarcon@mvgfc.edu.ph",
      contactNumber: "0917-555-0202",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Tuesday",
      semesterTerm,
      courseTitle: "WEB ENHANCED ANIMATION GRAPHICS",
      instructorName: "AZARCON, JOHN CARLO",
      colorTone: "navy",
      startTime: "15:00",
      endTime: "16:30",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 9,
      purpose: "WEB ENHANCED ANIMATION GRAPHICS \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-6",
      referenceNumber: "MVGFC-2026-0012",
      ownerUserId: "iict.faculty@mvgfc.edu.ph",
      fullName: "IICT Faculty",
      requestorType: "Faculty",
      idNumber: "FAC-0043",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "iict.faculty@mvgfc.edu.ph",
      contactNumber: "0917-555-0203",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Wednesday",
      semesterTerm,
      courseTitle: "INFORMATION ASSURANCE AND SECURITY 1",
      instructorName: "IICT FACULTY",
      colorTone: "sage",
      startTime: "09:00",
      endTime: "12:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 10,
      purpose: "INFORMATION ASSURANCE AND SECURITY 1 \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-7",
      referenceNumber: "MVGFC-2026-0013",
      ownerUserId: "a.sevilla@mvgfc.edu.ph",
      fullName: "Arnel A. Sevilla",
      requestorType: "Faculty",
      idNumber: "FAC-0041",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "a.sevilla@mvgfc.edu.ph",
      contactNumber: "0917-555-0201",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Thursday",
      semesterTerm,
      courseTitle: "CS PRACTICUM",
      instructorName: "SEVILLA, ARNEL A.",
      colorTone: "navy",
      startTime: "13:00",
      endTime: "14:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 8,
      purpose: "CS PRACTICUM \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-8",
      referenceNumber: "MVGFC-2026-0014",
      ownerUserId: "iict.faculty@mvgfc.edu.ph",
      fullName: "IICT Full Time Faculty",
      requestorType: "Faculty",
      idNumber: "FAC-0043",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "iict.faculty@mvgfc.edu.ph",
      contactNumber: "0917-555-0203",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Friday",
      semesterTerm,
      courseTitle: "INFORMATION ASSURANCE AND SECURITY 1",
      instructorName: "IICT FULL TIME FACULTY",
      colorTone: "sage",
      startTime: "09:30",
      endTime: "12:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 10,
      purpose: "INFORMATION ASSURANCE AND SECURITY 1 \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    },
    {
      id: "res-sem-9",
      referenceNumber: "MVGFC-2026-0015",
      ownerUserId: "iict.faculty@mvgfc.edu.ph",
      fullName: "IICT Full Time Faculty",
      requestorType: "Faculty",
      idNumber: "FAC-0043",
      department: "Institute of Information & Computing Technologies (IICT)",
      email: "iict.faculty@mvgfc.edu.ph",
      contactNumber: "0917-555-0203",
      bookingType: "semester",
      date: today,
      dayOfWeek: "Friday",
      semesterTerm,
      courseTitle: "IS PROJECT MANAGEMENT",
      instructorName: "IICT FULL TIME FACULTY",
      colorTone: "peach",
      startTime: "13:00",
      endTime: "16:00",
      roomId: "room-c",
      roomName: "Discussion Room C (Room 3)",
      participants: 10,
      purpose: "IS PROJECT MANAGEMENT \u2014 Whole Semester Class Schedule",
      equipment: [],
      rulesAgreed: true,
      status: "Approved",
      reviewedBy: "Dr. Leonila S. Paez, RL",
      reviewedAt: new Date(now.getTime() - 2592e5).toISOString(),
      createdAt: new Date(now.getTime() - 3456e5).toISOString(),
      updatedAt: new Date(now.getTime() - 2592e5).toISOString(),
      auditTrail: []
    }
  ];
  const emails = [
    {
      id: "email-seed-1",
      sentAt: reservations[0].reviewedAt,
      ...buildEmailFromTemplate("approved", reservations[0], settings)
    },
    {
      id: "email-seed-2",
      sentAt: reservations[2].createdAt,
      ...buildEmailFromTemplate("new_submission_requestor", reservations[2], settings)
    },
    {
      id: "email-seed-3",
      sentAt: reservations[2].createdAt,
      ...buildEmailFromTemplate("new_submission_admin", reservations[2], settings)
    }
  ];
  const createdIso = now.toISOString();
  return {
    users: [],
    admins: [],
    rooms,
    closures,
    reservations,
    emails,
    emailUsage: {},
    waitlist: [],
    staffNotifications: [],
    rules: createSeedRules(createdIso),
    guidelines: createSeedGuidelines(createdIso),
    activityLogs: [
      {
        id: "act-seed-1",
        timestamp: createdIso,
        actorId: "system",
        actorName: "System",
        actorRole: "System",
        category: "Settings",
        action: "Initialized library discussion room portal",
        target: "MVGFC Library Portal",
        details: "Seeded default rooms, institutional rules, guidelines, and semester timetable."
      }
    ],
    tutorialPreferences: {},
    settings,
    sequenceCounter: 15
  };
}
var cachedDb = null;
var lockChain = Promise.resolve();
function loadDatabase() {
  if (cachedDb) return cachedDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      cachedDb = JSON.parse(raw);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (!cachedDb.emailUsage) cachedDb.emailUsage = {};
      if (!Array.isArray(cachedDb.waitlist)) cachedDb.waitlist = [];
      if (!Array.isArray(cachedDb.staffNotifications)) cachedDb.staffNotifications = [];
      if (!Array.isArray(cachedDb.rules) || cachedDb.rules.length === 0) {
        cachedDb.rules = createSeedRules(nowIso);
      }
      if (!Array.isArray(cachedDb.guidelines) || cachedDb.guidelines.length === 0) {
        cachedDb.guidelines = createSeedGuidelines(nowIso);
      }
      if (!Array.isArray(cachedDb.activityLogs) || cachedDb.activityLogs.length === 0) {
        cachedDb.activityLogs = [
          {
            id: "act-seed-1",
            timestamp: nowIso,
            actorId: "system",
            actorName: "System",
            actorRole: "System",
            category: "Settings",
            action: "Initialized library discussion room portal",
            target: "MVGFC Library Portal",
            details: "Seeded default rooms, institutional rules, guidelines, and semester timetable."
          }
        ];
      }
      if (!cachedDb.tutorialPreferences || typeof cachedDb.tutorialPreferences !== "object") {
        cachedDb.tutorialPreferences = {};
      }
      if (typeof cachedDb.settings?.notifyStaffOnCancellation !== "boolean") {
        cachedDb.settings.notifyStaffOnCancellation = true;
      }
      if (!cachedDb.settings.contactDescription) {
        cachedDb.settings.contactDescription = "Reach out to MVGFC Library personnel for urgent booking adjustments, technical equipment assistance, or reservation status inquiries.";
      }
      if (!Array.isArray(cachedDb.settings.additionalContacts)) {
        cachedDb.settings.additionalContacts = [
          {
            id: "cnt-seed-1",
            label: "Circulation & Reserve Desk",
            phone: cachedDb.settings.contactPhone || "(044) 463-1122 loc. 204",
            email: cachedDb.settings.monitoredEmail || "library@mvgfc.edu.ph",
            hours: cachedDb.settings.deskHours || "Mon \u2013 Sat \xB7 8:00 AM \u2013 5:00 PM",
            description: "Handles QR check-in passes, room keys, and same-day schedule releases."
          }
        ];
      }
      if (Array.isArray(cachedDb.rooms)) {
        cachedDb.rooms = cachedDb.rooms.map((rm) => ({
          ...rm,
          building: rm.building || "Main Academic Building",
          locationDetail: rm.locationDetail || rm.floor || "Main Library",
          roomType: rm.roomType || (rm.imageKey === "seminar" ? "Seminar Room" : rm.imageKey === "research" ? "Research & Class Room" : "Study Group Room"),
          status: rm.status || (rm.active ? "Available" : "Unavailable"),
          capacity: Math.max(2, Math.min(rm.capacity || 10, 50))
        }));
      }
      return cachedDb;
    }
  } catch (err) {
    console.error("Failed to read portal database, re-initializing seed state:", err);
  }
  cachedDb = createInitialSeedDatabase();
  saveDatabaseSync(cachedDb);
  return cachedDb;
}
function saveDatabaseSync(db) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmpPath, DB_FILE);
}
async function withDbLock(fn) {
  const next = lockChain.then(async () => {
    const db = loadDatabase();
    const result = await fn(db);
    saveDatabaseSync(db);
    return result;
  });
  lockChain = next.catch(() => void 0);
  return next;
}
function appendActivityLog(db, entry) {
  if (!Array.isArray(db.activityLogs)) {
    db.activityLogs = [];
  }
  const item = {
    id: `act-${crypto2.randomUUID()}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  db.activityLogs.unshift(item);
  if (db.activityLogs.length > 500) {
    db.activityLogs = db.activityLogs.slice(0, 500);
  }
  return item;
}
function saveRoomUploadedImage(roomId, extension, buffer) {
  if (!fs.existsSync(ROOM_UPLOADS_DIR)) {
    fs.mkdirSync(ROOM_UPLOADS_DIR, { recursive: true });
  }
  const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${safeRoomId}-${crypto2.randomUUID()}.${extension}`;
  const resolved = path.resolve(ROOM_UPLOADS_DIR, filename);
  if (!resolved.startsWith(ROOM_UPLOADS_DIR + path.sep)) {
    throw new Error("INVALID_UPLOAD_PATH");
  }
  fs.writeFileSync(resolved, buffer);
  return `/api/uploads/rooms/${filename}`;
}
function deleteRoomUploadedImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/api/uploads/rooms/")) return;
  const filename = imageUrl.slice("/api/uploads/rooms/".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return;
  const resolved = path.resolve(ROOM_UPLOADS_DIR, filename);
  if (!resolved.startsWith(ROOM_UPLOADS_DIR + path.sep)) return;
  try {
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch {
  }
}

// server/mailer.ts
var EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function getEmailAttemptLimit() {
  const raw = Number(process.env.EMAIL_QUOTA_PER_USER);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 20) {
    return Math.floor(raw);
  }
  return DEFAULT_EMAIL_ATTEMPT_LIMIT;
}
function isSmtpConfigured() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(user && pass);
}
function getUserEmailQuota(db, email) {
  const limit = getEmailAttemptLimit();
  const key = normalizeEmailKey(email);
  const used = db.emailUsage?.[key]?.attempts ?? 0;
  return computeEmailQuota(used, limit);
}
function reserveEmailAttempt(db, emailRecord) {
  const limit = getEmailAttemptLimit();
  if (!db.emailUsage) {
    db.emailUsage = {};
  }
  const isAdminPlaceholder = emailRecord.recipientRole === "Library Administrator" && process.env.SMTP_ADMIN_NOTIFY !== "true";
  if (isAdminPlaceholder) {
    emailRecord.deliveryStatus = "logged";
    emailRecord.deliveryNote = "Recorded in Library Staff Portal outbox.";
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: getUserEmailQuota(db, emailRecord.recipientEmail)
    };
  }
  const key = normalizeEmailKey(emailRecord.recipientEmail);
  const existing = db.emailUsage[key] || { attempts: 0, sentCount: 0, lastAttemptAt: "" };
  if (!isSmtpConfigured()) {
    emailRecord.deliveryStatus = "logged";
    emailRecord.deliveryNote = "Saved in portal only \u2014 add SMTP_USER and SMTP_PASS in Secrets to deliver to your inbox.";
    emailRecord.quotaLimit = limit;
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: computeEmailQuota(existing.attempts, limit)
    };
  }
  if (existing.attempts >= limit) {
    emailRecord.deliveryStatus = "quota_skipped";
    emailRecord.attemptNumber = existing.attempts;
    emailRecord.quotaLimit = limit;
    emailRecord.deliveryNote = `Email limit reached (${limit}/${limit} attempts used for this address). Check updates in My Reservations.`;
    return {
      emailId: emailRecord.id,
      shouldSend: false,
      quota: computeEmailQuota(existing.attempts, limit)
    };
  }
  const nextAttempts = existing.attempts + 1;
  db.emailUsage[key] = {
    attempts: nextAttempts,
    sentCount: existing.sentCount,
    lastAttemptAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  emailRecord.attemptNumber = nextAttempts;
  emailRecord.quotaLimit = limit;
  emailRecord.deliveryStatus = "logged";
  emailRecord.deliveryNote = `Dispatching email (attempt ${nextAttempts} of ${limit})...`;
  return {
    emailId: emailRecord.id,
    shouldSend: true,
    quota: computeEmailQuota(nextAttempts, limit)
  };
}
var cachedTransporter = null;
var cachedConfigKey = "";
function getTransporter() {
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS?.trim() || "";
  if (!user || !pass) return null;
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const portRaw = Number(process.env.SMTP_PORT || 465);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 465;
  const secure = port === 465;
  const configKey = `${host}:${port}:${user}:${pass.length}`;
  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 8e3,
      greetingTimeout: 8e3,
      socketTimeout: 1e4
    });
    cachedConfigKey = configKey;
  }
  return cachedTransporter;
}
function sanitizeSafeError(err) {
  if (err && typeof err === "object") {
    const code = "code" in err && typeof err.code === "string" ? err.code : "";
    const responseCode = "responseCode" in err && typeof err.responseCode === "number" ? String(err.responseCode) : "";
    if (code || responseCode) {
      return `Mail server rejected delivery (${[code, responseCode].filter(Boolean).join(" ")})`;
    }
  }
  return "Mail server could not deliver this message. Verify SMTP_USER and SMTP_PASS in Secrets.";
}
async function deliverReservedEmail(task, emailSnapshot) {
  if (!task.shouldSend) {
    return { email: emailSnapshot, quota: task.quota };
  }
  const toAddress = sanitizeEmailHeader(emailSnapshot.recipientEmail);
  const subject = sanitizeEmailHeader(emailSnapshot.subject);
  const transporter = getTransporter();
  let status = "failed";
  let note = "SMTP transport unavailable.";
  if (!EMAIL_FORMAT_RE.test(toAddress)) {
    note = "Invalid recipient email address format.";
  } else if (transporter) {
    const smtpUser = sanitizeEmailHeader(process.env.SMTP_USER || "");
    const mailFromRaw = process.env.MAIL_FROM?.trim();
    const fromHeader = mailFromRaw ? sanitizeEmailHeader(mailFromRaw) : `MVGFC Library <${smtpUser}>`;
    try {
      await transporter.sendMail({
        from: fromHeader,
        to: toAddress,
        subject,
        text: emailSnapshot.body
      });
      status = "sent";
      note = `Delivered to ${toAddress} (attempt ${emailSnapshot.attemptNumber ?? 1} of ${emailSnapshot.quotaLimit ?? getEmailAttemptLimit()}).`;
    } catch (err) {
      status = "failed";
      note = sanitizeSafeError(err);
    }
  }
  const updated = await withDbLock((db) => {
    const target = db.emails.find((e) => e.id === task.emailId);
    if (target) {
      target.deliveryStatus = status;
      target.deliveryNote = note;
    }
    if (status === "sent") {
      const key = normalizeEmailKey(toAddress);
      if (db.emailUsage[key]) {
        db.emailUsage[key].sentCount += 1;
      }
    }
    return {
      email: target || { ...emailSnapshot, deliveryStatus: status, deliveryNote: note },
      quota: getUserEmailQuota(db, toAddress)
    };
  });
  return updated;
}

// server.ts
function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}
function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
    return;
  }
  req.auth = payload;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth?.role !== "admin") {
      res.status(403).json({ error: "Access denied. Authorized library personnel only." });
      return;
    }
    next();
  });
}
function getSessionCanManageStaff(db, auth) {
  if (!auth || auth.role !== "admin") return false;
  const envPasscodeConfigured = (process.env.ADMIN_PASSCODE || "").trim().length > 0;
  return canSessionManageStaff({
    authMethod: auth.authMethod,
    adminId: auth.sub,
    envPasscodeConfigured,
    primaryAdminId: db.admins[0]?.id || null
  });
}
function requireStaffManager(req, res, next) {
  requireAdmin(req, res, () => {
    const db = loadDatabase();
    if (!getSessionCanManageStaff(db, req.auth)) {
      res.status(403).json({
        error: "Only an administrator signed in with the Admin Passcode can add or manage staff accounts."
      });
      return;
    }
    next();
  });
}
function sanitizeString(value, maxLen = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}
function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function verifyLookupOwnership(target, emailInput, refInput, auth) {
  if (auth?.role === "admin") return true;
  if (!emailInput || !refInput) return false;
  return target.email.trim().toLowerCase() === emailInput.trim().toLowerCase() && target.referenceNumber.trim().toUpperCase() === refInput.trim().toUpperCase();
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/uploads/rooms/:filename", (req, res) => {
    const filename = sanitizeString(req.params.filename, 140);
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: "Invalid filename." });
      return;
    }
    const resolved = path2.resolve(ROOM_UPLOADS_DIR, filename);
    if (!resolved.startsWith(ROOM_UPLOADS_DIR + path2.sep) || !fs2.existsSync(resolved)) {
      res.status(404).json({ error: "Image not found." });
      return;
    }
    res.sendFile(resolved);
  });
  app.get("/api/public/overview", (_req, res) => {
    const db = loadDatabase();
    res.json({
      rooms: db.rooms,
      closures: db.closures,
      settings: db.settings,
      schedule: sanitizePublicSchedule(db.reservations, db.closures, db.rooms),
      rules: [...db.rules || []].filter((r) => r.published).sort((a, b) => a.order - b.order),
      guidelines: [...db.guidelines || []].filter((g) => g.published).sort((a, b) => a.order - b.order),
      emailDelivery: {
        smtpConfigured: isSmtpConfigured(),
        maxAttemptsPerUser: getEmailAttemptLimit()
      }
    });
  });
  app.get("/api/public/availability", (req, res) => {
    const db = loadDatabase();
    const date = sanitizeString(req.query.date, 20);
    const roomId = sanitizeString(req.query.roomId, 60);
    let schedule = sanitizePublicSchedule(db.reservations, db.closures, db.rooms, date || void 0);
    if (roomId) {
      schedule = schedule.filter((item) => item.roomId === roomId);
    }
    res.json({ schedule });
  });
  app.post("/api/waitlist", async (req, res) => {
    const roomId = sanitizeString(req.body?.roomId, 60);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const fullName = sanitizeString(req.body?.fullName, 120);
    const outcome = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room) {
        return { status: 404, error: "Selected discussion room was not found." };
      }
      const check = validateWaitlistSignupInput({ email, fullName }, room);
      if (!check.valid) {
        return { status: 400, error: check.error };
      }
      if (!Array.isArray(db.waitlist)) db.waitlist = [];
      if (hasActiveWaitlistEntry(db.waitlist, room.id, check.email)) {
        return {
          status: 200,
          alreadyJoined: true,
          message: `You are already on the waitlist for ${room.name}. We will email ${check.email} as soon as it becomes Available.`
        };
      }
      const entry = {
        id: `wl-${crypto3.randomUUID()}`,
        roomId: room.id,
        roomName: room.name,
        email: check.email,
        fullName: check.fullName,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        status: "waiting"
      };
      db.waitlist.unshift(entry);
      if (db.waitlist.length > 1e3) {
        db.waitlist = db.waitlist.slice(0, 1e3);
      }
      return {
        status: 201,
        alreadyJoined: false,
        entry: {
          id: entry.id,
          roomId: entry.roomId,
          roomName: entry.roomName,
          status: entry.status,
          createdAt: entry.createdAt
        },
        message: `You are on the waitlist for ${room.name}. We will send an automated email to ${check.email} once it is marked Available.`
      };
    });
    if ("error" in outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.status(outcome.status).json({
      alreadyJoined: outcome.alreadyJoined,
      entry: "entry" in outcome ? outcome.entry : void 0,
      message: outcome.message,
      smtpConfigured: isSmtpConfigured()
    });
  });
  app.post("/api/auth/register", async (req, res) => {
    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const requestorType = req.body?.requestorType === "Faculty" ? "Faculty" : "Student";
    const idNumber = sanitizeString(req.body?.idNumber, 60);
    const department = sanitizeString(req.body?.department, 120);
    const contactNumber = sanitizeString(req.body?.contactNumber, 40);
    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid full name and institutional email are required." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    if (!idNumber || !department || !contactNumber) {
      res.status(400).json({ error: "Student/Employee Number, Department, and Contact Number are required." });
      return;
    }
    try {
      const result = await withDbLock((db) => {
        const existing = db.users.find((u) => u.email === email);
        if (existing) {
          throw new Error("EMAIL_EXISTS");
        }
        const userId = `usr-${crypto3.randomUUID()}`;
        const userRecord = {
          id: userId,
          fullName,
          email,
          passwordHash: hashPassword(password),
          requestorType,
          idNumber,
          department,
          contactNumber,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        db.users.push(userRecord);
        const authUser = {
          id: userRecord.id,
          fullName: userRecord.fullName,
          email: userRecord.email,
          role: "requestor",
          requestorType: userRecord.requestorType,
          idNumber: userRecord.idNumber,
          department: userRecord.department,
          contactNumber: userRecord.contactNumber
        };
        const token = signSessionToken({
          sub: authUser.id,
          email: authUser.email,
          role: "requestor",
          fullName: authUser.fullName
        });
        return { user: authUser, token };
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_EXISTS") {
        res.status(409).json({ error: "An account with this email already exists. Please sign in." });
        return;
      }
      res.status(500).json({ error: "Unable to register account." });
    }
  });
  app.post("/api/auth/login", (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const db = loadDatabase();
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const authUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: "requestor",
      requestorType: user.requestorType,
      idNumber: user.idNumber,
      department: user.department,
      contactNumber: user.contactNumber
    };
    const token = signSessionToken({
      sub: authUser.id,
      email: authUser.email,
      role: "requestor",
      fullName: authUser.fullName
    });
    res.json({ user: authUser, token });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const db = loadDatabase();
    if (req.auth.role === "admin") {
      const admin = db.admins.find((a) => a.id === req.auth.sub);
      const authMethod = req.auth.authMethod || (req.auth.sub === "adm-env-override" ? "passcode" : "staff");
      const authUser2 = {
        id: req.auth.sub,
        fullName: admin?.fullName || req.auth.fullName,
        email: admin?.email || req.auth.email,
        role: "admin",
        authMethod,
        canManageStaff: getSessionCanManageStaff(db, { ...req.auth, authMethod }),
        staffTitle: admin?.staffTitle || (authMethod === "passcode" ? "Administrator Passcode Session" : "Library Administrator")
      };
      res.json({ user: authUser2 });
      return;
    }
    const user = db.users.find((u) => u.id === req.auth.sub);
    if (!user) {
      res.status(401).json({ error: "User account not found." });
      return;
    }
    const authUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: "requestor",
      requestorType: user.requestorType,
      idNumber: user.idNumber,
      department: user.department,
      contactNumber: user.contactNumber
    };
    res.json({ user: authUser });
  });
  app.get("/api/auth/admin/status", (_req, res) => {
    const db = loadDatabase();
    const envPasscode = (process.env.ADMIN_PASSCODE || "").trim();
    res.json({
      claimed: db.admins.length > 0,
      envPasscodeConfigured: envPasscode.length > 0
    });
  });
  app.post("/api/auth/admin/claim", async (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || "").trim();
    if (envPasscode.length > 0) {
      res.status(403).json({ error: "Administrator passcode is managed via server Secrets. Please sign in." });
      return;
    }
    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const staffTitle = sanitizeString(req.body?.staffTitle, 80) || "Head Librarian";
    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Full name and valid library email are required." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Administrator password must be at least 6 characters." });
      return;
    }
    try {
      const result = await withDbLock((db) => {
        if (db.admins.length > 0) {
          throw new Error("ALREADY_CLAIMED");
        }
        const adminId = `adm-${crypto3.randomUUID()}`;
        const adminRecord = {
          id: adminId,
          fullName,
          email,
          staffTitle,
          passwordHash: hashPassword(password),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          active: true
        };
        db.admins.push(adminRecord);
        const authUser = {
          id: adminRecord.id,
          fullName: adminRecord.fullName,
          email: adminRecord.email,
          role: "admin",
          authMethod: "staff",
          canManageStaff: true,
          staffTitle: adminRecord.staffTitle
        };
        const token = signSessionToken({
          sub: authUser.id,
          email: authUser.email,
          role: "admin",
          fullName: authUser.fullName,
          authMethod: "staff"
        });
        return { user: authUser, token };
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_CLAIMED") {
        res.status(409).json({ error: "Library administrator account has already been initialized. Please sign in." });
        return;
      }
      res.status(500).json({ error: "Unable to initialize administrator account." });
    }
  });
  app.post("/api/auth/admin/login", (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const envPasscode = (process.env.ADMIN_PASSCODE || "").trim();
    const db = loadDatabase();
    const matchedAdmin = email ? db.admins.find((a) => a.active && a.email === email) : void 0;
    if (envPasscode.length > 0 && verifyEnvPasscode(password, envPasscode)) {
      const staffEmail = email || db.settings.monitoredEmail;
      const authUser = {
        id: "adm-env-override",
        fullName: matchedAdmin?.fullName || "MVGFC Library Administrator",
        email: staffEmail,
        role: "admin",
        authMethod: "passcode",
        canManageStaff: true,
        staffTitle: matchedAdmin?.staffTitle || "Administrator Passcode Session"
      };
      const token = signSessionToken({
        sub: authUser.id,
        email: authUser.email,
        role: "admin",
        fullName: authUser.fullName,
        authMethod: "passcode"
      });
      res.json({ user: authUser, token });
      return;
    }
    if (matchedAdmin && verifyPassword(password, matchedAdmin.passwordHash)) {
      const canManageStaff = getSessionCanManageStaff(db, {
        sub: matchedAdmin.id,
        email: matchedAdmin.email,
        role: "admin",
        fullName: matchedAdmin.fullName,
        authMethod: "staff",
        exp: 0
      });
      const authUser = {
        id: matchedAdmin.id,
        fullName: matchedAdmin.fullName,
        email: matchedAdmin.email,
        role: "admin",
        authMethod: "staff",
        canManageStaff,
        staffTitle: matchedAdmin.staffTitle
      };
      const token = signSessionToken({
        sub: authUser.id,
        email: authUser.email,
        role: "admin",
        fullName: authUser.fullName,
        authMethod: "staff"
      });
      res.json({ user: authUser, token });
      return;
    }
    res.status(401).json({ error: "Invalid library staff credentials or admin passcode." });
  });
  app.post("/api/my/reservations/lookup", (req, res) => {
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40).toUpperCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please enter the institutional email address used on your request." });
      return;
    }
    if (!referenceNumber) {
      res.status(400).json({ error: "Please enter your Reference Number (e.g. MVGFC-2026-0001)." });
      return;
    }
    const db = loadDatabase();
    const matched = db.reservations.filter(
      (r) => r.email.trim().toLowerCase() === email && r.referenceNumber.trim().toUpperCase() === referenceNumber
    );
    if (matched.length === 0) {
      res.status(404).json({
        error: "No reservation found matching both that institutional email and reference number."
      });
      return;
    }
    const matchedIds = new Set(matched.map((r) => r.id));
    const emails = db.emails.filter((e) => matchedIds.has(e.reservationId) && e.recipientRole === "Requestor").sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    res.json({
      reservations: matched,
      emails,
      emailQuota: getUserEmailQuota(db, email),
      smtpConfigured: isSmtpConfigured()
    });
  });
  app.post("/api/reservations", async (req, res) => {
    const body = req.body;
    const bookingType = body.bookingType === "semester" ? "semester" : "borrowing";
    const rawDate = sanitizeString(body.date, 20) || formatYmdLocal(/* @__PURE__ */ new Date());
    const rawDay = sanitizeString(body.dayOfWeek, 20);
    const derivedDay = bookingType === "semester" ? DAYS_OF_WEEK.includes(rawDay) ? rawDay : void 0 : getDayOfWeekFromYmd(rawDate) || void 0;
    const rawTone = sanitizeString(body.colorTone, 20);
    const safeTone = CLASS_COLOR_TONES.includes(rawTone) ? rawTone : CLASS_COLOR_TONES[Math.floor(Math.random() * CLASS_COLOR_TONES.length)];
    const formInput = {
      fullName: sanitizeString(body.fullName, 120),
      requestorType: body.requestorType === "Faculty" ? "Faculty" : "Student",
      idNumber: sanitizeString(body.idNumber, 60),
      department: sanitizeString(body.department, 120),
      email: sanitizeString(body.email, 160).toLowerCase(),
      contactNumber: sanitizeString(body.contactNumber, 40),
      bookingType,
      date: rawDate,
      dayOfWeek: derivedDay,
      semesterTerm: bookingType === "semester" ? sanitizeString(body.semesterTerm, 80) : void 0,
      courseTitle: bookingType === "semester" ? sanitizeString(body.courseTitle, 120) : void 0,
      instructorName: bookingType === "semester" ? sanitizeString(body.instructorName, 120) || sanitizeString(body.fullName, 120) : void 0,
      colorTone: bookingType === "semester" ? safeTone : void 0,
      startTime: sanitizeString(body.startTime, 10),
      endTime: sanitizeString(body.endTime, 10),
      roomId: sanitizeString(body.roomId, 60),
      participants: Number(body.participants),
      purpose: sanitizeString(body.purpose, 500) || (bookingType === "semester" ? `${sanitizeString(body.courseTitle, 120)} \u2014 Whole Semester Class` : ""),
      equipment: [],
      specialRequests: sanitizeString(body.specialRequests, 400) || void 0,
      additionalInfo: sanitizeString(body.additionalInfo, 400) || void 0,
      rulesAgreed: Boolean(body.rulesAgreed)
    };
    try {
      const outcome = await withDbLock((db) => {
        const room = db.rooms.find((r) => r.id === formInput.roomId);
        const validation = validateReservationRequest(
          formInput,
          room,
          db.settings,
          db.closures,
          db.reservations
        );
        if (!validation.valid || !room) {
          return { error: validation.errors[0] || "Invalid reservation request.", errors: validation.errors };
        }
        db.sequenceCounter += 1;
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const refNo = generateReferenceNumber(db.sequenceCounter, formInput.date);
        const newReservation = {
          id: `res-${crypto3.randomUUID()}`,
          referenceNumber: refNo,
          ownerUserId: formInput.email,
          ...formInput,
          roomName: room.name,
          status: "Pending",
          createdAt: nowIso,
          updatedAt: nowIso,
          auditTrail: [
            {
              id: `aud-${crypto3.randomUUID()}`,
              timestamp: nowIso,
              actorName: formInput.fullName,
              actorRole: "Requestor",
              action: bookingType === "semester" ? `Submitted semester class reservation request (${formInput.dayOfWeek})` : "Submitted room borrowing request (Pending Review)",
              toStatus: "Pending"
            }
          ]
        };
        db.reservations.unshift(newReservation);
        const requestorEmail = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("new_submission_requestor", newReservation, db.settings)
        };
        const adminEmail = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("new_submission_admin", newReservation, db.settings)
        };
        const requestorTask = reserveEmailAttempt(db, requestorEmail);
        reserveEmailAttempt(db, adminEmail);
        db.emails.unshift(requestorEmail, adminEmail);
        return {
          reservation: newReservation,
          acknowledgementEmail: requestorEmail,
          requestorTask,
          warnings: validation.warnings
        };
      });
      if ("error" in outcome) {
        res.status(400).json(outcome);
        return;
      }
      const delivered = await deliverReservedEmail(outcome.requestorTask, outcome.acknowledgementEmail);
      res.status(201).json({
        reservation: outcome.reservation,
        acknowledgementEmail: delivered.email,
        emailQuota: delivered.quota,
        warnings: outcome.warnings
      });
    } catch {
      res.status(500).json({ error: "Unable to submit reservation request." });
    }
  });
  app.post("/api/reservations/:id/reply-info", async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    const reply = sanitizeString(req.body?.reply, 600);
    const email = sanitizeString(req.body?.email, 160);
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40);
    const bearer = getBearerToken(req);
    const auth = bearer ? verifySessionToken(bearer) || void 0 : void 0;
    if (!reply || reply.length < 3) {
      res.status(400).json({ error: "Please provide your response to the library staff inquiry." });
      return;
    }
    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: "Reservation not found." };
      if (!verifyLookupOwnership(target, email, referenceNumber, auth)) {
        return { status: 403, error: "Verification failed. Email and reference number do not match this request." };
      }
      if (target.status !== "Needs Information") {
        return { status: 400, error: "This request is not currently awaiting additional information." };
      }
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      target.requestorInfoReply = reply;
      target.status = "Pending";
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto3.randomUUID()}`,
        timestamp: nowIso,
        actorName: target.fullName,
        actorRole: "Requestor",
        action: "Submitted requested clarification; returned to Pending Review",
        fromStatus: "Needs Information",
        toStatus: "Pending",
        note: reply
      });
      return { status: 200, reservation: target };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ reservation: result.reservation });
  });
  app.post("/api/reservations/:id/cancel", async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    const reason = sanitizeString(req.body?.reason, 300) || "Cancelled by requestor";
    const email = sanitizeString(req.body?.email, 160);
    const referenceNumber = sanitizeString(req.body?.referenceNumber, 40);
    const bearer = getBearerToken(req);
    const auth = bearer ? verifySessionToken(bearer) || void 0 : void 0;
    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: "Reservation not found." };
      if (!verifyLookupOwnership(target, email, referenceNumber, auth)) {
        return { status: 403, error: "Verification failed. Email and reference number do not match this booking." };
      }
      if (target.status === "Cancelled" || target.status === "Completed" || target.status === "Rejected") {
        return { status: 400, error: `Cannot cancel a reservation with status "${target.status}".` };
      }
      const prev = target.status;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      target.status = "Cancelled";
      target.cancellationReason = reason;
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto3.randomUUID()}`,
        timestamp: nowIso,
        actorName: auth?.role === "admin" ? auth.fullName : target.fullName,
        actorRole: auth?.role === "admin" ? "Library Admin" : "Requestor",
        action: "Cancelled reservation",
        fromStatus: prev,
        toStatus: "Cancelled",
        note: reason
      });
      const emailLog = {
        id: `eml-${crypto3.randomUUID()}`,
        sentAt: nowIso,
        ...buildEmailFromTemplate("cancelled", target, db.settings, { reason })
      };
      const emailTask = reserveEmailAttempt(db, emailLog);
      db.emails.unshift(emailLog);
      const notifEnabled = db.settings.notifyStaffOnCancellation !== false;
      const staffNotif = auth?.role !== "admin" ? buildStaffCancellationNotification(
        target,
        prev,
        reason,
        notifEnabled,
        nowIso,
        `ntf-${crypto3.randomUUID()}`
      ) : null;
      if (staffNotif) {
        if (!Array.isArray(db.staffNotifications)) {
          db.staffNotifications = [];
        }
        db.staffNotifications.unshift(staffNotif);
      }
      return { status: 200, reservation: target, email: emailLog, emailTask, staffNotified: Boolean(staffNotif) };
    });
    if (result.status !== 200 || !result.email || !result.emailTask) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const delivered = await deliverReservedEmail(result.emailTask, result.email);
    res.json({
      reservation: result.reservation,
      email: delivered.email,
      emailQuota: delivered.quota,
      staffNotified: result.staffNotified
    });
  });
  app.use("/api/admin", requireAdmin);
  app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const today = formatYmdLocal(/* @__PURE__ */ new Date());
    const counts = {
      pending: db.reservations.filter((r) => r.status === "Pending").length,
      needsInfo: db.reservations.filter((r) => r.status === "Needs Information").length,
      approved: db.reservations.filter((r) => r.status === "Approved").length,
      rejected: db.reservations.filter((r) => r.status === "Rejected").length,
      upcoming: db.reservations.filter(
        (r) => r.status === "Approved" && (r.bookingType === "semester" || r.date >= today)
      ).length,
      completed: db.reservations.filter((r) => r.status === "Completed").length,
      cancelled: db.reservations.filter((r) => r.status === "Cancelled").length,
      noShow: db.reservations.filter((r) => r.status === "No-show").length
    };
    res.json({
      counts,
      recentPending: db.reservations.filter((r) => r.status === "Pending" || r.status === "Needs Information").slice(0, 5)
    });
  });
  app.get("/api/admin/reservations", requireAdmin, (req, res) => {
    const db = loadDatabase();
    const status = sanitizeString(req.query.status, 40);
    const date = sanitizeString(req.query.date, 20);
    const roomId = sanitizeString(req.query.roomId, 60);
    const department = sanitizeString(req.query.department, 120);
    const search = sanitizeString(req.query.search, 120).toLowerCase();
    let list = [...db.reservations];
    if (status && status !== "All") {
      list = list.filter((r) => r.status === status);
    }
    if (date) {
      list = list.filter((r) => r.date === date);
    }
    if (roomId && roomId !== "All") {
      list = list.filter((r) => r.roomId === roomId);
    }
    if (department && department !== "All") {
      list = list.filter((r) => r.department === department);
    }
    if (search) {
      list = list.filter(
        (r) => r.referenceNumber.toLowerCase().includes(search) || r.fullName.toLowerCase().includes(search) || r.idNumber.toLowerCase().includes(search) || r.purpose.toLowerCase().includes(search) || (r.courseTitle || "").toLowerCase().includes(search)
      );
    }
    const enriched = list.map((r) => ({
      ...r,
      confirmedConflicts: findConfirmedConflicts(r, db.reservations, db.settings.bufferMinutes).map(
        (c) => c.referenceNumber
      ),
      competingPending: findCompetingPendingRequests(r, db.reservations, db.settings.bufferMinutes).map(
        (c) => c.referenceNumber
      )
    }));
    res.json({ reservations: enriched });
  });
  app.post("/api/admin/reservations/:id/decision", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    const action = sanitizeString(req.body?.action, 40);
    const note = sanitizeString(req.body?.note, 500);
    const result = await withDbLock((db) => {
      const target = db.reservations.find((r) => r.id === id);
      if (!target) return { status: 404, error: "Reservation record not found." };
      const room = db.rooms.find((r) => r.id === target.roomId);
      const prevStatus = target.status;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const adminName = req.auth.fullName;
      if (action === "approve") {
        if (!room || !room.active || room.status === "Unavailable" || room.status === "Under Maintenance") {
          return { status: 409, error: "Room is currently unavailable or under maintenance and cannot be confirmed." };
        }
        const effectiveCap = Math.max(2, Math.min(room.capacity, 50));
        if (target.participants > effectiveCap) {
          return {
            status: 409,
            error: `Participants (${target.participants}) exceed ${room.name} capacity (${effectiveCap} persons max).`
          };
        }
        const closureHits = db.closures.filter(
          (c) => c.roomId === target.roomId && (target.bookingType === "semester" ? getDayOfWeekFromYmd(c.date) === target.dayOfWeek : c.date === target.date) && c.startTime < target.endTime && target.startTime < c.endTime
        );
        if (closureHits.length > 0) {
          return { status: 409, error: `Room has a scheduled closure: ${closureHits[0].reason}` };
        }
        const conflicts = findConfirmedConflicts(target, db.reservations, db.settings.bufferMinutes);
        if (conflicts.length > 0) {
          return {
            status: 409,
            error: `Cannot approve: conflicts with confirmed booking ${conflicts[0].referenceNumber} (${conflicts[0].startTime}\u2013${conflicts[0].endTime}).`
          };
        }
        target.status = "Approved";
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        if (note) target.adminNote = note;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Approved reservation after conflict & capacity verification",
          fromStatus: prevStatus,
          toStatus: "Approved",
          note: note || void 0
        });
        const email = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("approved", target, db.settings)
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Approved reservation request",
          target: target.referenceNumber,
          details: `${target.roomName} \xB7 ${target.date} (${target.startTime}\u2013${target.endTime})`
        });
        return { status: 200, reservation: target, email, emailTask };
      }
      if (action === "reject") {
        if (!note) {
          return { status: 400, error: "Please provide a brief rejection reason for the requestor." };
        }
        target.status = "Rejected";
        target.adminNote = note;
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Declined reservation request",
          fromStatus: prevStatus,
          toStatus: "Rejected",
          note
        });
        const email = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("rejected", target, db.settings, { reason: note })
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Declined reservation request",
          target: target.referenceNumber,
          details: note
        });
        return { status: 200, reservation: target, email, emailTask };
      }
      if (action === "request_info") {
        if (!note) {
          return { status: 400, error: "Please explain what missing information is needed from the requestor." };
        }
        target.status = "Needs Information";
        target.infoRequestPrompt = note;
        target.reviewedBy = adminName;
        target.reviewedAt = nowIso;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Requested additional information from requestor",
          fromStatus: prevStatus,
          toStatus: "Needs Information",
          note
        });
        const email = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("needs_information", target, db.settings, { infoPrompt: note })
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Requested clarification from requestor",
          target: target.referenceNumber,
          details: note
        });
        return { status: 200, reservation: target, email, emailTask };
      }
      if (action === "complete") {
        target.status = "Completed";
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Marked reservation Completed",
          fromStatus: prevStatus,
          toStatus: "Completed",
          note: note || void 0
        });
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Marked reservation Completed",
          target: target.referenceNumber
        });
        return { status: 200, reservation: target };
      }
      if (action === "no_show") {
        target.status = "No-show";
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Marked reservation as No-show",
          fromStatus: prevStatus,
          toStatus: "No-show",
          note: note || void 0
        });
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Marked reservation No-show",
          target: target.referenceNumber
        });
        return { status: 200, reservation: target };
      }
      if (action === "cancel") {
        target.status = "Cancelled";
        target.cancellationReason = note || "Cancelled by library staff";
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: "Cancelled reservation",
          fromStatus: prevStatus,
          toStatus: "Cancelled",
          note: target.cancellationReason
        });
        const email = {
          id: `eml-${crypto3.randomUUID()}`,
          sentAt: nowIso,
          ...buildEmailFromTemplate("cancelled", target, db.settings, { reason: target.cancellationReason })
        };
        const emailTask = reserveEmailAttempt(db, email);
        db.emails.unshift(email);
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Cancelled reservation",
          target: target.referenceNumber,
          details: target.cancellationReason
        });
        return { status: 200, reservation: target, email, emailTask };
      }
      if (action === "update") {
        const newDate = sanitizeString(req.body?.date, 20) || target.date;
        const newStart = sanitizeString(req.body?.startTime, 10) || target.startTime;
        const newEnd = sanitizeString(req.body?.endTime, 10) || target.endTime;
        const newRoomId = sanitizeString(req.body?.roomId, 60) || target.roomId;
        const targetRoom = db.rooms.find((r) => r.id === newRoomId);
        if (!targetRoom) return { status: 400, error: "Invalid room selected." };
        const updatedDay = target.bookingType === "semester" ? target.dayOfWeek : getDayOfWeekFromYmd(newDate) || void 0;
        if (target.status === "Approved") {
          const conflicts = findConfirmedConflicts(
            {
              id: target.id,
              roomId: newRoomId,
              bookingType: target.bookingType,
              date: newDate,
              dayOfWeek: updatedDay,
              semesterTerm: target.semesterTerm,
              startTime: newStart,
              endTime: newEnd
            },
            db.reservations,
            db.settings.bufferMinutes
          );
          if (conflicts.length > 0) {
            return {
              status: 409,
              error: `Updated slot conflicts with confirmed booking ${conflicts[0].referenceNumber}.`
            };
          }
        }
        target.date = newDate;
        target.dayOfWeek = updatedDay;
        target.startTime = newStart;
        target.endTime = newEnd;
        target.roomId = targetRoom.id;
        target.roomName = targetRoom.name;
        if (note) target.adminNote = note;
        target.updatedAt = nowIso;
        target.auditTrail.push({
          id: `aud-${crypto3.randomUUID()}`,
          timestamp: nowIso,
          actorName: adminName,
          actorRole: "Library Admin",
          action: `Updated booking schedule to ${targetRoom.name} on ${newDate} (${newStart}\u2013${newEnd})`,
          note: note || void 0
        });
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: adminName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Reservations",
          action: "Updated reservation schedule",
          target: target.referenceNumber,
          details: `${targetRoom.name} \xB7 ${newDate} (${newStart}\u2013${newEnd})`
        });
        return { status: 200, reservation: target };
      }
      return { status: 400, error: "Unsupported administrative action." };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    if (result.email && result.emailTask) {
      const delivered = await deliverReservedEmail(result.emailTask, result.email);
      res.json({ reservation: result.reservation, email: delivered.email, emailQuota: delivered.quota });
      return;
    }
    res.json({ reservation: result.reservation, email: result.email });
  });
  app.post("/api/admin/check-in", requireAdmin, async (req, res) => {
    const rawCode = sanitizeString(req.body?.code, 240);
    const parsed = parseCheckInScanInput(rawCode);
    if (!parsed) {
      res.status(400).json({
        error: "Invalid QR code or reference number. Scan a valid MVGFC check-in pass or enter e.g. MVGFC-2026-0001."
      });
      return;
    }
    const result = await withDbLock((db) => {
      const target = db.reservations.find(
        (r) => r.referenceNumber.trim().toUpperCase() === parsed.referenceNumber
      );
      if (!target) {
        return { status: 404, error: `No reservation found for ${parsed.referenceNumber}.` };
      }
      if (target.status === "Completed") {
        return {
          status: 409,
          error: `${target.referenceNumber} has already been checked in${target.checkedInAt ? ` (${new Date(target.checkedInAt).toLocaleString()})` : ""}.`
        };
      }
      if (target.status !== "Approved") {
        return {
          status: 409,
          error: `Cannot check in ${target.referenceNumber}: current status is "${target.status}". Only Approved reservations can check in.`
        };
      }
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const adminName = req.auth.fullName;
      target.status = "Completed";
      target.checkedInAt = nowIso;
      target.checkedInBy = adminName;
      target.updatedAt = nowIso;
      target.auditTrail.push({
        id: `aud-${crypto3.randomUUID()}`,
        timestamp: nowIso,
        actorName: adminName,
        actorRole: "Library Admin",
        action: parsed.isQrPayload ? "Verified QR Check-In Pass at Circulation Desk" : "Checked in reservation via Reference Number at Circulation Desk",
        fromStatus: "Approved",
        toStatus: "Completed"
      });
      return { status: 200, reservation: target };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    await withDbLock((db) => {
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Reservations",
        action: "Checked in reservation pass",
        target: result.reservation.referenceNumber,
        details: `${result.reservation.fullName} \u2014 ${result.reservation.roomName}`
      });
    });
    res.json({ reservation: result.reservation });
  });
  app.get("/api/admin/rooms", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const waitlistCounts = {};
    for (const entry of db.waitlist || []) {
      if (entry.status === "waiting") {
        waitlistCounts[entry.roomId] = (waitlistCounts[entry.roomId] || 0) + 1;
      }
    }
    res.json({ rooms: db.rooms, closures: db.closures, waitlistCounts });
  });
  app.post("/api/admin/rooms", requireAdmin, async (req, res) => {
    const name = sanitizeString(req.body?.name, 80);
    const code = sanitizeString(req.body?.code, 40) || `DR-${Date.now().toString().slice(-3)}`;
    const building = sanitizeString(req.body?.building, 100) || "Main Academic Building";
    const floor = sanitizeString(req.body?.floor, 80) || "2nd Floor";
    const locationDetail = sanitizeString(req.body?.locationDetail, 120);
    const roomType = sanitizeString(req.body?.roomType, 60) || "Study Group Room";
    const description = sanitizeString(req.body?.description, 400);
    const additionalInstructions = sanitizeString(req.body?.additionalInstructions, 400);
    const capacity = Number(req.body?.capacity ?? 8);
    const minParticipants = Number(req.body?.minParticipants ?? 2);
    const statusInput = sanitizeString(req.body?.status, 30) || "Available";
    const openTime = sanitizeString(req.body?.openTime, 10) || "08:00";
    const closeTime = sanitizeString(req.body?.closeTime, 10) || "17:00";
    const amenities = Array.isArray(req.body?.amenities) ? req.body.amenities.map((a) => sanitizeString(a, 80)).filter(Boolean) : [];
    const check = validateRoomUpdateInput({
      name,
      capacity,
      minParticipants,
      status: statusInput,
      openTime,
      closeTime
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const created = await withDbLock((db) => {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const newRoom = {
        id: `room-${crypto3.randomUUID().slice(0, 8)}`,
        name,
        code,
        building,
        floor,
        locationDetail,
        roomType,
        capacity: Math.round(capacity),
        minParticipants: Math.round(minParticipants),
        active: statusInput === "Available",
        status: statusInput,
        openTime,
        closeTime,
        amenities,
        description: description || "Library discussion and collaboration room.",
        additionalInstructions: additionalInstructions || void 0,
        imageKey: capacity <= 6 ? "small" : "seminar",
        updatedAt: nowIso,
        updatedBy: req.auth.fullName
      };
      db.rooms.push(newRoom);
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rooms",
        action: "Created new discussion room",
        target: newRoom.name,
        details: `Capacity ${newRoom.capacity} pax \xB7 ${newRoom.building} ${newRoom.floor}`
      });
      return newRoom;
    });
    res.status(201).json({ room: created });
  });
  app.patch("/api/admin/rooms/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const body = req.body || {};
    const statusInput = typeof body.status === "string" && ALLOWED_ROOM_STATUSES.includes(body.status) ? body.status : void 0;
    const validation = validateRoomUpdateInput({
      name: typeof body.name === "string" ? body.name : void 0,
      capacity: typeof body.capacity === "number" ? body.capacity : void 0,
      minParticipants: typeof body.minParticipants === "number" ? body.minParticipants : void 0,
      status: statusInput,
      openTime: typeof body.openTime === "string" ? body.openTime : void 0,
      closeTime: typeof body.closeTime === "string" ? body.closeTime : void 0
    });
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const result = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === id);
      if (!room) return null;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const prevRoomState = {
        active: room.active,
        status: room.status || (room.active ? "Available" : "Unavailable")
      };
      if (typeof body.name === "string" && body.name.trim()) room.name = sanitizeString(body.name, 80);
      if (typeof body.code === "string" && body.code.trim()) room.code = sanitizeString(body.code, 40);
      if (typeof body.building === "string") room.building = sanitizeString(body.building, 100);
      if (typeof body.floor === "string") room.floor = sanitizeString(body.floor, 80);
      if (typeof body.locationDetail === "string") room.locationDetail = sanitizeString(body.locationDetail, 120);
      if (typeof body.roomType === "string" && body.roomType.trim()) room.roomType = sanitizeString(body.roomType, 60);
      if (typeof body.description === "string") room.description = sanitizeString(body.description, 450);
      if (typeof body.additionalInstructions === "string") {
        room.additionalInstructions = sanitizeString(body.additionalInstructions, 450) || void 0;
      }
      if (typeof body.capacity === "number") {
        room.capacity = Math.round(body.capacity);
      }
      if (typeof body.minParticipants === "number") {
        room.minParticipants = Math.min(Math.round(body.minParticipants), room.capacity);
      }
      if (Array.isArray(body.amenities)) {
        room.amenities = body.amenities.map((a) => sanitizeString(a, 80)).filter(Boolean);
      }
      if (statusInput) {
        room.status = statusInput;
        room.active = statusInput === "Available";
      } else if (typeof body.active === "boolean") {
        room.active = body.active;
        room.status = body.active ? "Available" : "Unavailable";
      }
      if (typeof body.openTime === "string") room.openTime = sanitizeString(body.openTime, 10);
      if (typeof body.closeTime === "string") room.closeTime = sanitizeString(body.closeTime, 10);
      room.updatedAt = nowIso;
      room.updatedBy = req.auth.fullName;
      for (const r of db.reservations) {
        if (r.roomId === room.id && r.roomName !== room.name) {
          r.roomName = room.name;
        }
      }
      const waitlistTasks = [];
      if (didRoomTransitionToAvailable(prevRoomState, { active: room.active, status: room.status })) {
        const waitingEntries = (db.waitlist || []).filter(
          (w) => w.roomId === room.id && w.status === "waiting"
        );
        for (const entry of waitingEntries) {
          const email = {
            id: `eml-${crypto3.randomUUID()}`,
            sentAt: nowIso,
            ...buildWaitlistAvailableEmail(entry, room, db.settings)
          };
          const task = reserveEmailAttempt(db, email);
          db.emails.unshift(email);
          entry.status = "notified";
          entry.notifiedAt = nowIso;
          entry.deliveryStatus = email.deliveryStatus;
          waitlistTasks.push({ waitlistId: entry.id, task, email });
        }
      }
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rooms",
        action: "Updated room profile & specifications",
        target: room.name,
        details: `Capacity ${room.minParticipants}\u2013${room.capacity} pax \xB7 Status: ${room.status}`
      });
      if (waitlistTasks.length > 0) {
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: req.auth.fullName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Rooms",
          action: "Triggered automated room waitlist notifications",
          target: room.name,
          details: `Dispatched ${waitlistTasks.length} availability alert(s) via SMTP service`
        });
      }
      return { room, waitlistTasks };
    });
    if (!result) {
      res.status(404).json({ error: "Room not found." });
      return;
    }
    let waitlistSentCount = 0;
    if (result.waitlistTasks.length > 0) {
      const deliveries = await Promise.all(
        result.waitlistTasks.map(async (item) => ({
          waitlistId: item.waitlistId,
          delivery: await deliverReservedEmail(item.task, item.email)
        }))
      );
      waitlistSentCount = deliveries.filter((d) => d.delivery.email.deliveryStatus === "sent").length;
      await withDbLock((db) => {
        for (const d of deliveries) {
          const wl = (db.waitlist || []).find((entry) => entry.id === d.waitlistId);
          if (wl) {
            wl.deliveryStatus = d.delivery.email.deliveryStatus;
          }
        }
      });
    }
    res.json({
      room: result.room,
      waitlistNotifiedCount: result.waitlistTasks.length,
      waitlistSentCount,
      smtpConfigured: isSmtpConfigured()
    });
  });
  app.post(
    "/api/admin/rooms/:id/image",
    express.json({ limit: "4mb" }),
    requireAdmin,
    async (req, res) => {
      const id = sanitizeString(req.params.id, 60);
      const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
      const parsed = validateImageDataUrl(dataUrl);
      if (!parsed.valid) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      try {
        const result = await withDbLock((db) => {
          const room = db.rooms.find((r) => r.id === id);
          if (!room) return null;
          const previousUrl = room.imageUrl;
          const nextUrl = saveRoomUploadedImage(room.id, parsed.extension, parsed.buffer);
          room.imageUrl = nextUrl;
          room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          room.updatedBy = req.auth.fullName;
          deleteRoomUploadedImage(previousUrl);
          appendActivityLog(db, {
            actorId: req.auth.sub,
            actorName: req.auth.fullName,
            actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
            category: "Rooms",
            action: previousUrl ? "Replaced room photograph" : "Uploaded room photograph",
            target: room.name,
            details: `${parsed.mimeType} (${Math.round(parsed.buffer.length / 1024)} KB)`
          });
          return room;
        });
        if (!result) {
          res.status(404).json({ error: "Room not found." });
          return;
        }
        res.json({ room: result });
      } catch {
        res.status(500).json({ error: "Unable to save uploaded room image." });
      }
    }
  );
  app.delete("/api/admin/rooms/:id/image", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const room = db.rooms.find((r) => r.id === id);
      if (!room) return null;
      const previousUrl = room.imageUrl;
      deleteRoomUploadedImage(previousUrl);
      delete room.imageUrl;
      room.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      room.updatedBy = req.auth.fullName;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rooms",
        action: "Removed custom room photograph",
        target: room.name
      });
      return room;
    });
    if (!result) {
      res.status(404).json({ error: "Room not found." });
      return;
    }
    res.json({ room: result });
  });
  app.post("/api/admin/closures", requireAdmin, async (req, res) => {
    const roomId = sanitizeString(req.body?.roomId, 60);
    const date = sanitizeString(req.body?.date, 20);
    const startTime = sanitizeString(req.body?.startTime, 10);
    const endTime = sanitizeString(req.body?.endTime, 10);
    const reason = sanitizeString(req.body?.reason, 200);
    if (!roomId || !date || !startTime || !endTime || !reason) {
      res.status(400).json({ error: "Room, date, time range, and closure reason are required." });
      return;
    }
    if (endTime <= startTime) {
      res.status(400).json({ error: "Closure end time must be after start time." });
      return;
    }
    const closure = await withDbLock((db) => {
      const item = {
        id: `closure-${crypto3.randomUUID()}`,
        roomId,
        date,
        startTime,
        endTime,
        reason,
        createdBy: req.auth.fullName,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.closures.unshift(item);
      const roomName = db.rooms.find((r) => r.id === roomId)?.name || roomId;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rooms",
        action: "Scheduled temporary room closure",
        target: roomName,
        details: `${date} (${startTime}\u2013${endTime}) \xB7 ${reason}`
      });
      return item;
    });
    res.status(201).json({ closure });
  });
  app.delete("/api/admin/closures/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    await withDbLock((db) => {
      const existing = db.closures.find((c) => c.id === id);
      db.closures = db.closures.filter((c) => c.id !== id);
      if (existing) {
        const roomName = db.rooms.find((r) => r.id === existing.roomId)?.name || existing.roomId;
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: req.auth.fullName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Rooms",
          action: "Removed temporary room closure",
          target: roomName,
          details: `${existing.date} (${existing.startTime}\u2013${existing.endTime})`
        });
      }
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/reports", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      report: computeUtilizationReport(db.reservations, db.rooms)
    });
  });
  app.get("/api/admin/reports/export", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const header = [
      "Reference Number",
      "Booking Type",
      "Status",
      "Date / Day",
      "Start Time",
      "End Time",
      "Room",
      "Participants",
      "Requestor Name",
      "Classification",
      "ID Number",
      "Department",
      "Purpose / Course",
      "Reviewed By"
    ].join(",");
    const rows = db.reservations.map(
      (r) => [
        csvEscape(r.referenceNumber),
        csvEscape(r.bookingType === "semester" ? "Semester Class" : "Borrowing"),
        csvEscape(r.status),
        csvEscape(r.bookingType === "semester" ? `Every ${r.dayOfWeek} (${r.semesterTerm || ""})` : r.date),
        csvEscape(r.startTime),
        csvEscape(r.endTime),
        csvEscape(r.roomName),
        csvEscape(r.participants),
        csvEscape(r.fullName),
        csvEscape(r.requestorType),
        csvEscape(r.idNumber),
        csvEscape(r.department),
        csvEscape(r.courseTitle || r.purpose),
        csvEscape(r.reviewedBy || "")
      ].join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="mvgfc-library-reservations-report.csv"');
    res.send([header, ...rows].join("\n"));
  });
  app.get("/api/admin/emails", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      emails: db.emails,
      smtpConfigured: isSmtpConfigured(),
      maxAttemptsPerUser: getEmailAttemptLimit()
    });
  });
  app.post("/api/admin/reminders/send", requireAdmin, async (_req, res) => {
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatYmdLocal(tomorrow);
    const queued = await withDbLock((db) => {
      const targets = db.reservations.filter(
        (r) => r.status === "Approved" && r.bookingType !== "semester" && r.date === tomorrowStr
      );
      const tasks = [];
      for (const r of targets) {
        const alreadySent = db.emails.some(
          (e) => e.reservationId === r.id && e.trigger === "reminder"
        );
        if (!alreadySent) {
          const email = {
            id: `eml-${crypto3.randomUUID()}`,
            sentAt: (/* @__PURE__ */ new Date()).toISOString(),
            ...buildEmailFromTemplate("reminder", r, db.settings)
          };
          const task = reserveEmailAttempt(db, email);
          db.emails.unshift(email);
          tasks.push({ task, email });
        }
      }
      return tasks;
    });
    await Promise.all(queued.map((item) => deliverReservedEmail(item.task, item.email)));
    res.json({ sentCount: queued.length, targetDate: tomorrowStr });
  });
  app.get("/api/admin/settings", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({
      settings: db.settings,
      staff: db.admins.map(({ passwordHash: _pw, ...safe }) => safe)
    });
  });
  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    const rawContacts = Array.isArray(req.body?.additionalContacts) ? req.body.additionalContacts.map((c) => ({
      id: sanitizeString(c.id, 60) || `cnt-${crypto3.randomUUID().slice(0, 8)}`,
      label: sanitizeString(c.label, 80),
      phone: sanitizeString(c.phone, 60) || void 0,
      email: sanitizeString(c.email, 160) || void 0,
      hours: sanitizeString(c.hours, 80) || void 0,
      description: sanitizeString(c.description, 240) || void 0
    })) : void 0;
    const contactCheck = validateContactSettingsInput({
      monitoredEmail: typeof req.body?.monitoredEmail === "string" ? req.body.monitoredEmail : void 0,
      contactPhone: typeof req.body?.contactPhone === "string" ? req.body.contactPhone : void 0,
      libraryLocation: typeof req.body?.libraryLocation === "string" ? req.body.libraryLocation : void 0,
      deskHours: typeof req.body?.deskHours === "string" ? req.body.deskHours : void 0,
      additionalContacts: rawContacts
    });
    if (!contactCheck.valid) {
      res.status(400).json({ error: contactCheck.error });
      return;
    }
    const updated = await withDbLock((db) => {
      const s = db.settings;
      if (typeof req.body?.openTime === "string") s.openTime = sanitizeString(req.body.openTime, 10);
      if (typeof req.body?.closeTime === "string") s.closeTime = sanitizeString(req.body.closeTime, 10);
      if (typeof req.body?.semesterLabel === "string" && req.body.semesterLabel.trim()) {
        s.semesterLabel = sanitizeString(req.body.semesterLabel, 80);
      }
      if (typeof req.body?.maxBookingHours === "number") {
        s.maxBookingHours = Math.max(1, Math.min(8, req.body.maxBookingHours));
      }
      if (typeof req.body?.minNoticeMinutes === "number") {
        s.minNoticeMinutes = Math.max(0, Math.min(1440, req.body.minNoticeMinutes));
      }
      if (typeof req.body?.maxAdvanceDays === "number") {
        s.maxAdvanceDays = Math.max(1, Math.min(60, req.body.maxAdvanceDays));
      }
      if (typeof req.body?.bufferMinutes === "number") {
        s.bufferMinutes = Math.max(0, Math.min(60, req.body.bufferMinutes));
      }
      if (typeof req.body?.monitoredEmail === "string") s.monitoredEmail = sanitizeString(req.body.monitoredEmail, 160);
      if (typeof req.body?.contactPhone === "string") s.contactPhone = sanitizeString(req.body.contactPhone, 60);
      if (typeof req.body?.deskHours === "string") s.deskHours = sanitizeString(req.body.deskHours, 120);
      if (typeof req.body?.libraryLocation === "string") {
        s.libraryLocation = sanitizeString(req.body.libraryLocation, 200);
      }
      if (typeof req.body?.contactDescription === "string") {
        s.contactDescription = sanitizeString(req.body.contactDescription, 400);
      }
      if (rawContacts !== void 0) {
        s.additionalContacts = rawContacts;
      }
      if (typeof req.body?.notifyStaffOnCancellation === "boolean") {
        s.notifyStaffOnCancellation = req.body.notifyStaffOnCancellation;
      }
      const isContactEdit = req.body?.monitoredEmail !== void 0 || req.body?.contactPhone !== void 0 || req.body?.libraryLocation !== void 0 || req.body?.deskHours !== void 0 || req.body?.contactDescription !== void 0 || rawContacts !== void 0;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: isContactEdit ? "Contacts" : "Settings",
        action: isContactEdit ? "Updated institutional contact details" : "Updated booking safeguard policy",
        target: s.libraryName
      });
      return s;
    });
    res.json({ settings: updated });
  });
  app.get("/api/admin/rules", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const rules = [...db.rules || []].sort((a, b) => a.order - b.order);
    res.json({ rules });
  });
  app.post("/api/admin/rules", requireAdmin, async (req, res) => {
    const check = validateRuleInput({
      title: String(req.body?.title || ""),
      content: String(req.body?.content || "")
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const published = req.body?.published !== false;
    const created = await withDbLock((db) => {
      if (!Array.isArray(db.rules)) db.rules = [];
      const nextOrder = db.rules.reduce((m, r) => Math.max(m, r.order), 0) + 1;
      const item = {
        id: `rule-${crypto3.randomUUID().slice(0, 8)}`,
        title: check.normalized.title.slice(0, 120),
        content: check.normalized.content.slice(0, 600),
        order: nextOrder,
        published,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedBy: req.auth.fullName
      };
      db.rules.push(item);
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rules",
        action: "Created library rule",
        target: item.title,
        details: item.published ? "Published immediately" : "Saved as draft"
      });
      return item;
    });
    res.status(201).json({ rule: created });
  });
  app.patch("/api/admin/rules/reorder", requireAdmin, async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((v) => sanitizeString(v, 60)).filter(Boolean) : [];
    const rules = await withDbLock((db) => {
      db.rules = reorderOrderedItems(db.rules || [], orderedIds);
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rules",
        action: "Reordered library rules",
        target: `${db.rules.length} rules`
      });
      return db.rules;
    });
    res.json({ rules });
  });
  app.patch("/api/admin/rules/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const rule = (db.rules || []).find((r) => r.id === id);
      if (!rule) return { status: 404, error: "Rule not found." };
      const nextTitle = typeof req.body?.title === "string" ? req.body.title : rule.title;
      const nextContent = typeof req.body?.content === "string" ? req.body.content : rule.content;
      const check = validateRuleInput({ title: nextTitle, content: nextContent });
      if (!check.valid) return { status: 400, error: check.error };
      rule.title = check.normalized.title.slice(0, 120);
      rule.content = check.normalized.content.slice(0, 600);
      if (typeof req.body?.published === "boolean") rule.published = req.body.published;
      rule.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      rule.updatedBy = req.auth.fullName;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rules",
        action: "Updated library rule",
        target: rule.title,
        details: rule.published ? "Published" : "Unpublished"
      });
      return { status: 200, rule };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ rule: result.rule });
  });
  app.delete("/api/admin/rules/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const deleted = await withDbLock((db) => {
      const existing = (db.rules || []).find((r) => r.id === id);
      if (!existing) return null;
      db.rules = reorderOrderedItems(
        (db.rules || []).filter((r) => r.id !== id),
        []
      );
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Rules",
        action: "Deleted library rule",
        target: existing.title
      });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: "Rule not found." });
      return;
    }
    res.json({ ok: true });
  });
  app.get("/api/admin/guidelines", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const guidelines = [...db.guidelines || []].sort((a, b) => a.order - b.order);
    res.json({ guidelines });
  });
  app.post("/api/admin/guidelines", requireAdmin, async (req, res) => {
    const check = validateGuidelineInput({
      title: String(req.body?.title || ""),
      category: String(req.body?.category || GUIDELINE_CATEGORIES[0]),
      description: String(req.body?.description || ""),
      instructions: Array.isArray(req.body?.instructions) ? req.body.instructions.map(String) : []
    });
    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }
    const published = req.body?.published !== false;
    const created = await withDbLock((db) => {
      if (!Array.isArray(db.guidelines)) db.guidelines = [];
      const nextOrder = db.guidelines.reduce((m, g) => Math.max(m, g.order), 0) + 1;
      const item = {
        id: `gdl-${crypto3.randomUUID().slice(0, 8)}`,
        title: check.normalized.title.slice(0, 120),
        category: check.normalized.category,
        description: check.normalized.description.slice(0, 400),
        instructions: check.normalized.instructions.map((i) => i.slice(0, 400)),
        order: nextOrder,
        published,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedBy: req.auth.fullName
      };
      db.guidelines.push(item);
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Guidelines",
        action: "Created library guideline",
        target: item.title,
        details: `${item.category} \xB7 ${item.published ? "Published" : "Draft"}`
      });
      return item;
    });
    res.status(201).json({ guideline: created });
  });
  app.patch("/api/admin/guidelines/reorder", requireAdmin, async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map((v) => sanitizeString(v, 60)).filter(Boolean) : [];
    const guidelines = await withDbLock((db) => {
      db.guidelines = reorderOrderedItems(db.guidelines || [], orderedIds);
      return db.guidelines;
    });
    res.json({ guidelines });
  });
  app.patch("/api/admin/guidelines/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const result = await withDbLock((db) => {
      const item = (db.guidelines || []).find((g) => g.id === id);
      if (!item) return { status: 404, error: "Guideline not found." };
      const check = validateGuidelineInput({
        title: typeof req.body?.title === "string" ? req.body.title : item.title,
        category: typeof req.body?.category === "string" ? req.body.category : item.category,
        description: typeof req.body?.description === "string" ? req.body.description : item.description,
        instructions: Array.isArray(req.body?.instructions) ? req.body.instructions.map(String) : item.instructions
      });
      if (!check.valid) return { status: 400, error: check.error };
      item.title = check.normalized.title.slice(0, 120);
      item.category = check.normalized.category;
      item.description = check.normalized.description.slice(0, 400);
      item.instructions = check.normalized.instructions.map((i) => i.slice(0, 400));
      if (typeof req.body?.published === "boolean") item.published = req.body.published;
      item.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      item.updatedBy = req.auth.fullName;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Guidelines",
        action: "Updated library guideline",
        target: item.title,
        details: `${item.category} \xB7 ${item.published ? "Published" : "Unpublished"}`
      });
      return { status: 200, guideline: item };
    });
    if (result.status !== 200) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ guideline: result.guideline });
  });
  app.delete("/api/admin/guidelines/:id", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.params.id, 60);
    const deleted = await withDbLock((db) => {
      const existing = (db.guidelines || []).find((g) => g.id === id);
      if (!existing) return null;
      db.guidelines = reorderOrderedItems(
        (db.guidelines || []).filter((g) => g.id !== id),
        []
      );
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Guidelines",
        action: "Deleted library guideline",
        target: existing.title
      });
      return existing;
    });
    if (!deleted) {
      res.status(404).json({ error: "Guideline not found." });
      return;
    }
    res.json({ ok: true });
  });
  app.get("/api/admin/activity", requireAdmin, (req, res) => {
    const db = loadDatabase();
    const category = sanitizeString(req.query.category, 40);
    const search = sanitizeString(req.query.search, 120).toLowerCase();
    let logs = db.activityLogs || [];
    if (category && category !== "All") {
      logs = logs.filter((l) => l.category === category);
    }
    if (search) {
      logs = logs.filter(
        (l) => [l.actorName, l.category, l.action, l.target, l.details || ""].join(" ").toLowerCase().includes(search)
      );
    }
    res.json({ activityLogs: logs });
  });
  app.post("/api/admin/export/log", requireAdmin, async (req, res) => {
    const format = sanitizeString(req.body?.format, 10).toUpperCase();
    const category = sanitizeString(req.body?.category, 60);
    const rowCount = Number(req.body?.rowCount ?? 0);
    if (!format || !category) {
      res.status(400).json({ error: "Export format and category are required." });
      return;
    }
    await withDbLock((db) => {
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Exports",
        action: `Downloaded ${format} report`,
        target: category,
        details: `${Math.max(0, Math.round(rowCount))} record(s) exported`
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/admin/tutorial", requireAdmin, (req, res) => {
    const db = loadDatabase();
    const key = req.auth.sub;
    const pref = db.tutorialPreferences?.[key] || { completed: false, skipped: false, updatedAt: "" };
    res.json({ preference: pref });
  });
  app.post("/api/admin/tutorial", requireAdmin, async (req, res) => {
    const completed = Boolean(req.body?.completed);
    const skipped = Boolean(req.body?.skipped);
    const key = req.auth.sub;
    const pref = await withDbLock((db) => {
      if (!db.tutorialPreferences) db.tutorialPreferences = {};
      const next = {
        completed,
        skipped,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.tutorialPreferences[key] = next;
      return next;
    });
    res.json({ preference: pref });
  });
  app.get("/api/admin/notifications", requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const notifications = db.staffNotifications || [];
    const unreadCount = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unreadCount });
  });
  app.post("/api/admin/notifications/mark-read", requireAdmin, async (req, res) => {
    const id = sanitizeString(req.body?.id, 80);
    const markAll = Boolean(req.body?.all);
    const updated = await withDbLock((db) => {
      if (!Array.isArray(db.staffNotifications)) {
        db.staffNotifications = [];
      }
      for (const n of db.staffNotifications) {
        if (markAll || id && n.id === id) {
          n.read = true;
        }
      }
      return {
        notifications: db.staffNotifications,
        unreadCount: db.staffNotifications.filter((n) => !n.read).length
      };
    });
    res.json(updated);
  });
  app.post("/api/admin/staff", requireStaffManager, async (req, res) => {
    const fullName = sanitizeString(req.body?.fullName, 120);
    const email = sanitizeString(req.body?.email, 160).toLowerCase();
    const staffTitle = sanitizeString(req.body?.staffTitle, 80) || "Library Staff";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    try {
      const created = await withDbLock((db) => {
        const validation = validateNewStaffAccountInput(
          { fullName, email, staffTitle, password },
          db.admins.map((a) => a.email)
        );
        if (!validation.valid) {
          const isConflict = validation.error.includes("already exists");
          throw new Error(isConflict ? "EXISTS" : `VALIDATION:${validation.error}`);
        }
        const record = {
          id: `adm-${crypto3.randomUUID()}`,
          fullName: validation.normalized.fullName,
          email: validation.normalized.email,
          staffTitle: validation.normalized.staffTitle,
          passwordHash: hashPassword(validation.normalized.password),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          active: true
        };
        db.admins.push(record);
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: req.auth.fullName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Staff",
          action: "Created library staff account",
          target: record.fullName,
          details: `${record.staffTitle} (${record.email})`
        });
        const { passwordHash: _pw, ...safe } = record;
        return safe;
      });
      res.status(201).json({ staffMember: created });
    } catch (err) {
      if (err instanceof Error && err.message === "EXISTS") {
        res.status(409).json({ error: "A library staff account with this email already exists." });
        return;
      }
      if (err instanceof Error && err.message.startsWith("VALIDATION:")) {
        res.status(400).json({ error: err.message.slice("VALIDATION:".length) });
        return;
      }
      res.status(500).json({ error: "Unable to add library staff account." });
    }
  });
  app.patch("/api/admin/staff/:id", requireStaffManager, async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    if (id === req.auth.sub) {
      res.status(400).json({ error: "You cannot disable your own currently signed-in account." });
      return;
    }
    const active = typeof req.body?.active === "boolean" ? req.body.active : null;
    if (active === null) {
      res.status(400).json({ error: "Active status boolean is required." });
      return;
    }
    const updated = await withDbLock((db) => {
      const member = db.admins.find((a) => a.id === id);
      if (!member) return null;
      member.active = active;
      appendActivityLog(db, {
        actorId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
        category: "Staff",
        action: active ? "Activated staff account" : "Disabled staff account",
        target: member.fullName,
        details: member.email
      });
      const { passwordHash: _pw, ...safe } = member;
      return safe;
    });
    if (!updated) {
      res.status(404).json({ error: "Staff account not found." });
      return;
    }
    res.json({ staffMember: updated });
  });
  app.delete("/api/admin/staff/:id", requireStaffManager, async (req, res) => {
    const id = sanitizeString(req.params.id, 80);
    if (id === req.auth.sub) {
      res.status(400).json({ error: "You cannot remove your own currently signed-in administrator account." });
      return;
    }
    await withDbLock((db) => {
      const existing = db.admins.find((a) => a.id === id);
      db.admins = db.admins.filter((a) => a.id !== id);
      if (existing) {
        appendActivityLog(db, {
          actorId: req.auth.sub,
          actorName: req.auth.fullName,
          actorRole: req.auth.authMethod === "passcode" ? "Passcode Admin" : "Library Staff",
          category: "Staff",
          action: "Revoked library staff account",
          target: existing.fullName,
          details: existing.email
        });
      }
    });
    res.json({ ok: true });
  });
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });
  const PORT = 3e3;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MVGFC Library Portal server running on http://localhost:${PORT}`);
  });
}
startServer();
