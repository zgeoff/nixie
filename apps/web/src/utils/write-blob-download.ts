// Saves a blob as a file through a download link. The link holds a blob URL and never navigates to
// the blob, so the page's own origin never loads what the file holds.
export function writeBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;

  // Some browsers download nothing from a link outside the document.
  document.body.append(link);
  link.click();
  link.remove();

  // The browser reads the download URL after the click returns.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
