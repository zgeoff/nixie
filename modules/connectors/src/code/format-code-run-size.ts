const kibibyte = 1024;
const mebibyte = 1024 * 1024;

// A size as the code tool's sentences write it, such as 19.5 MiB.
export function formatCodeRunSize(bytes: number): string {
  if (bytes >= mebibyte) {
    return `${(bytes / mebibyte).toFixed(1)} MiB`;
  }

  if (bytes >= kibibyte) {
    return `${(bytes / kibibyte).toFixed(1)} KiB`;
  }

  return `${bytes} B`;
}
