import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExportDataset } from './enterpriseRules';

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/assets/aistudio/Untitled_design__10__c8874a7d.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInstitutionalPdfReport(options: {
  dataset: ExportDataset;
  institutionName: string;
  libraryName: string;
  generatedBy: string;
  filterSummary?: string;
}): Promise<void> {
  const { dataset, institutionName, libraryName, generatedBy, filterSummary } = options;
  const isWide = dataset.headers.length > 7;
  const doc = new jsPDF({
    orientation: isWide ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const logoDataUrl = await loadLogoDataUrl();
  const timestamp = new Date().toLocaleString();

  // Institutional header block
  let headerStartX = marginX;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginX, 28, 44, 44);
      headerStartX = marginX + 56;
    } catch {
      // Skip image gracefully if PDF raster fails
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 74, 52); // Institutional green #144A34
  doc.text(institutionName.toUpperCase(), headerStartX, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${libraryName} · Discussion Room Management System`, headerStartX, 57);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(dataset.title, marginX, 96);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`${dataset.subtitle}${filterSummary ? ` · Filters: ${filterSummary}` : ''}`, marginX, 111);
  doc.text(`Generated: ${timestamp} · Prepared by: ${generatedBy}`, marginX, 124);

  doc.setDrawColor(20, 74, 52);
  doc.setLineWidth(1.2);
  doc.line(marginX, 134, pageWidth - marginX, 134);

  autoTable(doc, {
    startY: 146,
    margin: { left: marginX, right: marginX, top: 44, bottom: 44 },
    head: [dataset.headers],
    body: dataset.rows.length > 0 ? dataset.rows : [dataset.headers.map((_, idx) => (idx === 0 ? 'No matching records found.' : ''))],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: isWide ? 7.5 : 8.2,
      cellPadding: 5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [20, 74, 52],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isWide ? 7.8 : 8.5,
    },
    alternateRowStyles: {
      fillColor: [247, 249, 248],
    },
    didDrawPage: (hookData) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${institutionName} — ${libraryName}`, marginX, pageHeight - 20);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
    },
  });

  // Update footer with total page count ("Page X of Y") cleanly
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(255, 255, 255);
    doc.rect(pageWidth - 130, pageHeight - 32, 95, 18, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${dataset.filenamePrefix}-${stamp}.pdf`);
}
