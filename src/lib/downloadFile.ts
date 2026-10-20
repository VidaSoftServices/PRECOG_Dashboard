/** Offers `content` to the user as a file download (client-side only - nothing is uploaded anywhere). */
export function downloadTextFile(fileName: string, content: string, mimeType = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Offers binary content (for example an .xlsx workbook) as a file download - client-side only, nothing is uploaded. */
export function downloadBinaryFile(fileName: string, bytes: Uint8Array, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
