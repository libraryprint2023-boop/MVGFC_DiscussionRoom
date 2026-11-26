import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CheckCircle2,
  DoorOpen,
  Edit3,
  ImagePlus,
  Lock,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ALLOWED_ROOM_STATUSES,
  MAX_IMAGE_BYTES,
  ROOM_TYPES,
  resolveRoomLocationLabel,
} from '../../lib/enterpriseRules';
import { formatTimeRange12h } from '../../lib/reservationRules';
import type { Room, RoomClosure, RoomStatus } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { RoomImage } from '../RoomImage';

interface AdminRoomsSectionProps {
  rooms: Room[];
  closures: RoomClosure[];
  waitlistCounts?: Record<string, number>;
  onCreateRoom: (payload: {
    name: string;
    code: string;
    building: string;
    floor: string;
    locationDetail: string;
    roomType: string;
    capacity: number;
    minParticipants: number;
    status: RoomStatus;
    openTime: string;
    closeTime: string;
    amenities: string[];
    description: string;
    additionalInstructions?: string;
  }) => Promise<Room>;
  onUpdateRoom: (
    id: string,
    patch: Partial<Room>
  ) => Promise<{
    room: Room;
    waitlistNotifiedCount?: number;
    waitlistSentCount?: number;
    smtpConfigured?: boolean;
  } | void>;
  onUploadRoomImage: (id: string, dataUrl: string) => Promise<void>;
  onDeleteRoomImage: (id: string) => Promise<void>;
  onCreateClosure: (payload: {
    roomId: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
  }) => Promise<void>;
  onDeleteClosure: (id: string) => Promise<void>;
}

interface RoomDraft {
  id?: string;
  name: string;
  code: string;
  building: string;
  floor: string;
  locationDetail: string;
  roomType: string;
  capacity: number;
  minParticipants: number;
  status: RoomStatus;
  openTime: string;
  closeTime: string;
  amenities: string[];
  description: string;
  additionalInstructions: string;
  imageUrl?: string;
  imageKey: 'small' | 'seminar' | 'research';
}

function emptyDraft(): RoomDraft {
  return {
    name: '',
    code: '',
    building: 'Main Academic Building',
    floor: '2nd Floor',
    locationDetail: '',
    roomType: 'Study Group Room',
    capacity: 10,
    minParticipants: 2,
    status: 'Available',
    openTime: '08:00',
    closeTime: '17:00',
    amenities: ['Whiteboard & Markers', 'Power Outlets'],
    description: '',
    additionalInstructions: '',
    imageKey: 'seminar',
  };
}

function roomToDraft(room: Room): RoomDraft {
  return {
    id: room.id,
    name: room.name,
    code: room.code,
    building: room.building || 'Main Academic Building',
    floor: room.floor || '2nd Floor',
    locationDetail: room.locationDetail || '',
    roomType: room.roomType || 'Study Group Room',
    capacity: room.capacity,
    minParticipants: room.minParticipants,
    status: room.status || (room.active ? 'Available' : 'Unavailable'),
    openTime: room.openTime,
    closeTime: room.closeTime,
    amenities: [...(room.amenities || [])],
    description: room.description || '',
    additionalInstructions: room.additionalInstructions || '',
    imageUrl: room.imageUrl,
    imageKey: room.imageKey || 'seminar',
  };
}

export function AdminRoomsSection({
  rooms,
  closures,
  waitlistCounts = {},
  onCreateRoom,
  onUpdateRoom,
  onUploadRoomImage,
  onDeleteRoomImage,
  onCreateClosure,
  onDeleteClosure,
}: AdminRoomsSectionProps) {
  const [editingDraft, setEditingDraft] = useState<RoomDraft | null>(null);
  const [amenityInput, setAmenityInput] = useState('');
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Closure form state
  const [closureRoomId, setClosureRoomId] = useState(rooms[0]?.id || 'room-a');
  const [closureDate, setClosureDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [closureStart, setClosureStart] = useState('13:00');
  const [closureEnd, setClosureEnd] = useState('17:00');
  const [closureReason, setClosureReason] = useState('');
  const [closureError, setClosureError] = useState<string | null>(null);

  // Confirm dialogs
  const [confirmRemovePhotoRoomId, setConfirmRemovePhotoRoomId] = useState<string | null>(null);
  const [confirmDeleteClosure, setConfirmDeleteClosure] = useState<RoomClosure | null>(null);

  const openEditorForRoom = (room: Room) => {
    setEditingDraft(roomToDraft(room));
    setAmenityInput('');
    setPendingDataUrl(null);
    setImageError(null);
    setSaveError(null);
  };

  const openNewRoomModal = () => {
    setEditingDraft(emptyDraft());
    setAmenityInput('');
    setPendingDataUrl(null);
    setImageError(null);
    setSaveError(null);
  };

  const handleImageFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageError('Only PNG, JPEG, or WebP image files are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Selected image exceeds the 2 MB maximum size limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingDataUrl(reader.result);
      }
    };
    reader.onerror = () => setImageError('Unable to read the selected image file.');
    reader.readAsDataURL(file);
  };

  const handleAddAmenity = () => {
    if (!editingDraft) return;
    const item = amenityInput.trim();
    if (!item) return;
    if (!editingDraft.amenities.some((a) => a.toLowerCase() === item.toLowerCase())) {
      setEditingDraft({ ...editingDraft, amenities: [...editingDraft.amenities, item] });
    }
    setAmenityInput('');
  };

  const handleSaveRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDraft) return;
    setSaveError(null);
    setSaving(true);

    try {
      let savedId = editingDraft.id;
      let waitlistNote = '';
      if (savedId) {
        const updateRes = await onUpdateRoom(savedId, {
          name: editingDraft.name,
          code: editingDraft.code,
          building: editingDraft.building,
          floor: editingDraft.floor,
          locationDetail: editingDraft.locationDetail,
          roomType: editingDraft.roomType,
          capacity: Number(editingDraft.capacity),
          minParticipants: Number(editingDraft.minParticipants),
          status: editingDraft.status,
          active: editingDraft.status === 'Available',
          openTime: editingDraft.openTime,
          closeTime: editingDraft.closeTime,
          amenities: editingDraft.amenities,
          description: editingDraft.description,
          additionalInstructions: editingDraft.additionalInstructions,
        });
        if (updateRes && updateRes.waitlistNotifiedCount && updateRes.waitlistNotifiedCount > 0) {
          waitlistNote = updateRes.smtpConfigured
            ? ` Automated waitlist alerts queued (${updateRes.waitlistSentCount ?? 0}/${updateRes.waitlistNotifiedCount} sent via SMTP).`
            : ` Automated waitlist alerts recorded for ${updateRes.waitlistNotifiedCount} waiting user(s) in the Email Notification Log.`;
        }
      } else {
        const created = await onCreateRoom({
          name: editingDraft.name,
          code: editingDraft.code,
          building: editingDraft.building,
          floor: editingDraft.floor,
          locationDetail: editingDraft.locationDetail,
          roomType: editingDraft.roomType,
          capacity: Number(editingDraft.capacity),
          minParticipants: Number(editingDraft.minParticipants),
          status: editingDraft.status,
          openTime: editingDraft.openTime,
          closeTime: editingDraft.closeTime,
          amenities: editingDraft.amenities,
          description: editingDraft.description,
          additionalInstructions: editingDraft.additionalInstructions || undefined,
        });
        savedId = created.id;
      }

      if (pendingDataUrl && savedId) {
        await onUploadRoomImage(savedId, pendingDataUrl);
      }

      setNotice(`Saved room profile for ${editingDraft.name}. Public room listings updated automatically.${waitlistNote}`);
      setEditingDraft(null);
      setPendingDataUrl(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unable to save room information.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddClosure = async (e: FormEvent) => {
    e.preventDefault();
    setClosureError(null);
    try {
      await onCreateClosure({
        roomId: closureRoomId,
        date: closureDate,
        startTime: closureStart,
        endTime: closureEnd,
        reason: closureReason,
      });
      setClosureReason('');
      setNotice('Scheduled temporary room closure.');
    } catch (err) {
      setClosureError(err instanceof Error ? err.message : 'Unable to add room closure.');
    }
  };

  return (
    <div data-tour="room-management" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Room Information Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure room details, capacities, buildings/floors, equipment, photos, operating statuses, and temporary closures.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewRoomModal}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Discussion Room</span>
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      {/* Room Cards Directory */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const status = room.status || (room.active ? 'Available' : 'Unavailable');
          const isAvailable = room.active && status === 'Available';
          return (
            <article key={room.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[16/10] w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                <RoomImage
                  variant={room.imageKey}
                  src={room.imageUrl}
                  alt={room.name}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-500">
                      {room.code} · {room.roomType || 'Discussion Room'}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        isAvailable
                          ? 'bg-emerald-50 text-emerald-800'
                          : status === 'Under Maintenance'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-base font-semibold text-slate-900">{room.name}</h2>
                  <p className="mt-0.5 text-xs text-slate-600">{resolveRoomLocationLabel(room)}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{room.description}</p>

                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Capacity</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {room.minParticipants}–{room.capacity} pax
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Hours</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {room.openTime}–{room.closeTime}
                      </dd>
                    </div>
                  </dl>

                  {room.amenities.length > 0 && (
                    <div className="mt-2.5 text-[11px] text-slate-500">
                      {room.amenities.join(' · ')}
                    </div>
                  )}
                  {(waitlistCounts[room.id] ?? 0) > 0 && (
                    <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                      {waitlistCounts[room.id]} waiting on email waitlist (notifies automatically when Available)
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3.5">
                  <button
                    type="button"
                    onClick={() => openEditorForRoom(room)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#144A34] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit Room &amp; Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const updateRes = await onUpdateRoom(room.id, {
                        status: isAvailable ? 'Unavailable' : 'Available',
                        active: !isAvailable,
                      });
                      if (updateRes && updateRes.waitlistNotifiedCount && updateRes.waitlistNotifiedCount > 0) {
                        setNotice(
                          `${room.name} marked Available. ${
                            updateRes.smtpConfigured
                              ? `Dispatched ${updateRes.waitlistSentCount ?? 0}/${updateRes.waitlistNotifiedCount} waitlist email(s) via SMTP.`
                              : `Logged ${updateRes.waitlistNotifiedCount} waitlist notification(s) in the Email Notification Log.`
                          }`
                        );
                      }
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    {isAvailable ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Temporary Closures */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#144A34]" />
          <h2 className="font-display text-lg font-semibold text-slate-900">Temporary Room Closures</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Closing a room blocks new requests and prevents approvals during the specified window.
        </p>

        {closureError && (
          <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
            {closureError}
          </div>
        )}

        <form onSubmit={handleAddClosure} className="mt-4 grid gap-3 border-b border-slate-100 pb-5 sm:grid-cols-5">
          <select
            aria-label="Room to close"
            value={closureRoomId}
            onChange={(e) => setClosureRoomId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Closure date"
            type="date"
            required
            value={closureDate}
            onChange={(e) => setClosureDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
          />
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Closure start time"
              type="time"
              required
              value={closureStart}
              onChange={(e) => setClosureStart(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
            />
            <input
              aria-label="Closure end time"
              type="time"
              required
              value={closureEnd}
              onChange={(e) => setClosureEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
            />
          </div>
          <input
            aria-label="Closure reason"
            type="text"
            required
            value={closureReason}
            onChange={(e) => setClosureReason(e.target.value)}
            placeholder="Reason (e.g. Library orientation)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#144A34] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Closure</span>
          </button>
        </form>

        <div className="mt-4 space-y-2.5">
          {closures.length === 0 ? (
            <p className="text-xs text-slate-500">No temporary room closures scheduled.</p>
          ) : (
            closures.map((c) => {
              const roomName = rooms.find((r) => r.id === c.roomId)?.name || c.roomId;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{roomName}</span>
                    {' · '}
                    <span className="font-mono tabular-nums">
                      {c.date} ({formatTimeRange12h(c.startTime, c.endTime)})
                    </span>
                    {' · '}
                    <span className="text-slate-600">{c.reason}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteClosure(c)}
                    aria-label={`Remove closure for ${roomName} on ${c.date}`}
                    className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Full 9-Field Room & Image Editor Modal */}
      {editingDraft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-editor-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <DoorOpen className="h-5 w-5 text-[#144A34]" />
                <div>
                  <h2 id="room-editor-title" className="font-display text-xl font-semibold text-slate-900">
                    {editingDraft.id ? `Edit ${editingDraft.name}` : 'Add New Discussion Room'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    All updates persist immediately to the database and public listings.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close room editor"
                onClick={() => setEditingDraft(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {saveError && (
              <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
                {saveError}
              </div>
            )}

            <form onSubmit={handleSaveRoom} className="mt-5 space-y-6">
              {/* Image Manager */}
              <div className="rounded-xl border border-slate-200 bg-[#F7F9F8] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <ImagePlus className="h-4 w-4 text-[#144A34]" />
                      <span>Room Photograph</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Accepted formats: PNG, JPEG, or WebP up to 2 MB. Previewed before saving.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>{editingDraft.imageUrl || pendingDataUrl ? 'Replace Image' : 'Upload Image'}</span>
                    </button>
                    {pendingDataUrl && (
                      <button
                        type="button"
                        onClick={() => setPendingDataUrl(null)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Discard Preview
                      </button>
                    )}
                    {editingDraft.id && editingDraft.imageUrl && !pendingDataUrl && (
                      <button
                        type="button"
                        onClick={() => setConfirmRemovePhotoRoomId(editingDraft.id!)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                </div>

                {imageError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
                    {imageError}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-4">
                  <div className="h-28 w-44 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <RoomImage
                      variant={editingDraft.imageKey}
                      src={pendingDataUrl || editingDraft.imageUrl}
                      alt={editingDraft.name || 'Room preview'}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="text-xs text-slate-600">
                    {pendingDataUrl ? (
                      <span className="font-semibold text-[#144A34]">
                        New image staged. Click &ldquo;Save Room Profile&rdquo; below to upload and publish.
                      </span>
                    ) : editingDraft.imageUrl ? (
                      <span>Custom uploaded room image active.</span>
                    ) : (
                      <span>Using default institutional room photograph.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 9 Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="rm-name" className="mb-1 block text-xs font-medium text-slate-700">
                    1. Room Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rm-name"
                    type="text"
                    required
                    value={editingDraft.name}
                    onChange={(e) => setEditingDraft({ ...editingDraft, name: e.target.value })}
                    placeholder="e.g. Discussion Room A (Room 1)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-code" className="mb-1 block text-xs font-medium text-slate-700">
                    Room Code
                  </label>
                  <input
                    id="rm-code"
                    type="text"
                    value={editingDraft.code}
                    onChange={(e) => setEditingDraft({ ...editingDraft, code: e.target.value })}
                    placeholder="e.g. DR-A · Room 1"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="rm-desc" className="mb-1 block text-xs font-medium text-slate-700">
                    2. Room Description <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    id="rm-desc"
                    rows={2}
                    required
                    value={editingDraft.description}
                    onChange={(e) => setEditingDraft({ ...editingDraft, description: e.target.value })}
                    placeholder="Describe intended study groups, layout, and acoustics..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-cap" className="mb-1 block text-xs font-medium text-slate-700">
                    4. Max Capacity (2–50 pax) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rm-cap"
                    type="number"
                    min={2}
                    max={50}
                    required
                    value={editingDraft.capacity}
                    onChange={(e) => setEditingDraft({ ...editingDraft, capacity: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-min" className="mb-1 block text-xs font-medium text-slate-700">
                    Minimum Participants
                  </label>
                  <input
                    id="rm-min"
                    type="number"
                    min={1}
                    max={editingDraft.capacity}
                    required
                    value={editingDraft.minParticipants}
                    onChange={(e) => setEditingDraft({ ...editingDraft, minParticipants: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-bldg" className="mb-1 block text-xs font-medium text-slate-700">
                    5a. Building Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rm-bldg"
                    type="text"
                    required
                    value={editingDraft.building}
                    onChange={(e) => setEditingDraft({ ...editingDraft, building: e.target.value })}
                    placeholder="Main Academic Building"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-floor" className="mb-1 block text-xs font-medium text-slate-700">
                    5b. Floor / Wing <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="rm-floor"
                    type="text"
                    required
                    value={editingDraft.floor}
                    onChange={(e) => setEditingDraft({ ...editingDraft, floor: e.target.value })}
                    placeholder="2nd Floor · East Wing"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-loc" className="mb-1 block text-xs font-medium text-slate-700">
                    5c. Specific Room Location
                  </label>
                  <input
                    id="rm-loc"
                    type="text"
                    value={editingDraft.locationDetail}
                    onChange={(e) => setEditingDraft({ ...editingDraft, locationDetail: e.target.value })}
                    placeholder="Near General Reference Section"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="rm-type" className="mb-1 block text-xs font-medium text-slate-700">
                    6. Room Type / Category
                  </label>
                  <select
                    id="rm-type"
                    value={editingDraft.roomType}
                    onChange={(e) => setEditingDraft({ ...editingDraft, roomType: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  >
                    {ROOM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rm-status" className="mb-1 block text-xs font-medium text-slate-700">
                    8. Room Status
                  </label>
                  <select
                    id="rm-status"
                    value={editingDraft.status}
                    onChange={(e) => setEditingDraft({ ...editingDraft, status: e.target.value as RoomStatus })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  >
                    {ALLOWED_ROOM_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rm-open" className="mb-1 block text-xs font-medium text-slate-700">
                      Open Time
                    </label>
                    <input
                      id="rm-open"
                      type="time"
                      required
                      value={editingDraft.openTime}
                      onChange={(e) => setEditingDraft({ ...editingDraft, openTime: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor="rm-close" className="mb-1 block text-xs font-medium text-slate-700">
                      Close Time
                    </label>
                    <input
                      id="rm-close"
                      type="time"
                      required
                      value={editingDraft.closeTime}
                      onChange={(e) => setEditingDraft({ ...editingDraft, closeTime: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-sm text-slate-900"
                    />
                  </div>
                </div>

                {/* 7. Available Equipment & Facilities */}
                <div className="sm:col-span-2">
                  <label htmlFor="rm-amenity-input" className="mb-1 block text-xs font-medium text-slate-700">
                    7. Available Equipment &amp; Facilities
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="rm-amenity-input"
                      type="text"
                      value={amenityInput}
                      onChange={(e) => setAmenityInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAmenity();
                        }
                      }}
                      placeholder="Add equipment or facility (e.g. HDMI Monitor, Whiteboard)"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#144A34] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddAmenity}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Add Facility
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editingDraft.amenities.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${item}`}
                          onClick={() =>
                            setEditingDraft({
                              ...editingDraft,
                              amenities: editingDraft.amenities.filter((a) => a !== item),
                            })
                          }
                          className="text-slate-400 hover:text-rose-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 9. Additional Instructions */}
                <div className="sm:col-span-2">
                  <label htmlFor="rm-instr" className="mb-1 block text-xs font-medium text-slate-700">
                    9. Additional Instructions
                  </label>
                  <textarea
                    id="rm-instr"
                    rows={2}
                    value={editingDraft.additionalInstructions}
                    onChange={(e) => setEditingDraft({ ...editingDraft, additionalInstructions: e.target.value })}
                    placeholder="Optional guidelines shown to requestors selecting this room..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingDraft(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#144A34] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save Room Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemovePhotoRoomId)}
        title="Remove Custom Room Image"
        description="Are you sure you want to remove the custom photograph for this room? The room will revert to the default library photograph."
        confirmLabel="Remove Image"
        onCancel={() => setConfirmRemovePhotoRoomId(null)}
        onConfirm={async () => {
          if (!confirmRemovePhotoRoomId) return;
          const targetId = confirmRemovePhotoRoomId;
          setConfirmRemovePhotoRoomId(null);
          await onDeleteRoomImage(targetId);
          if (editingDraft?.id === targetId) {
            setEditingDraft({ ...editingDraft, imageUrl: undefined });
          }
          setNotice('Removed custom room photograph.');
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteClosure)}
        title="Remove Temporary Closure"
        description={
          confirmDeleteClosure
            ? `Remove the scheduled closure on ${confirmDeleteClosure.date} (${confirmDeleteClosure.startTime}–${confirmDeleteClosure.endTime})? The time slot will reopen for reservation requests.`
            : ''
        }
        confirmLabel="Remove Closure"
        onCancel={() => setConfirmDeleteClosure(null)}
        onConfirm={async () => {
          if (!confirmDeleteClosure) return;
          const id = confirmDeleteClosure.id;
          setConfirmDeleteClosure(null);
          await onDeleteClosure(id);
          setNotice('Temporary room closure removed.');
        }}
      />
    </div>
  );
}
