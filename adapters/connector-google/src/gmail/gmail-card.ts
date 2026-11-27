import { z } from 'zod';

// The facts of a send that only the provider knows, which `prepare` reads before the decision and
// the approval card shows: the account it leaves from, the recipients, and the files it carries. The
// call's record seals them as an attachment, so a forget of the record erases them.
export type GmailCard = Readonly<Record<string, string>>;

const cardSchema = z.record(z.string(), z.string());

export function buildCardAttachment(card: GmailCard): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(card));
}

// Null when the attachment is no card.
export function parseCardAttachment(bytes: Uint8Array): GmailCard | null {
  try {
    const parsed = cardSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// `a, b`; empty when the list is
export function joinCardList(values: readonly string[]): string {
  return values.join(', ');
}

// the card's file line: each file by name and size
export function formatCardFiles(files: readonly { name: string; bytes: number }[]): string {
  return files.map((file) => `${file.name} (${formatSize(file.bytes)})`).join(', ');
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  }

  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${String(bytes)} B`;
}
