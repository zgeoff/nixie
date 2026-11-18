const kibibyte = 1024;
const mebibyte = 1024 * 1024;

// A file size as the owner reads it, such as 19.5 MiB.
export function formatFileSize(bytes: number): string {
  if (bytes >= mebibyte) {
    return `${(bytes / mebibyte).toFixed(1)} MiB`;
  }

  if (bytes >= kibibyte) {
    return `${(bytes / kibibyte).toFixed(1)} KiB`;
  }

  return `${String(bytes)} B`;
}
