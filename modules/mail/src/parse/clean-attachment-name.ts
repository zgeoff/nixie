const maxNameChars = 200;

// The name an attachment is kept under: the last segment of what the mail claims, with no control
// character, and cut to a length a file name holds. A mail names its own attachments, so the name
// never carries a folder.
export function cleanAttachmentName(claimed: string): string {
  const segment = claimed.split(/[/\\]/u).at(-1) ?? '';

  const clean = segment
    .replaceAll(/\p{Cc}/gu, '')
    .trim()
    .slice(0, maxNameChars);

  return clean === '' || clean === '.' || clean === '..' ? 'attachment' : clean;
}
