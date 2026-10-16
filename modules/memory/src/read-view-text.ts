import { decodeVersionText } from './decode-version-text';
import type { ViewText } from './view-types';

export interface SealedVersion {
  readonly itemID: string;
  readonly version: number;
  readonly sealed: string;
}

// A version's text and its quote, each as the memory view reads it.
export interface OpenedVersion {
  readonly text: ViewText;

  // null while the text is not readable, or when the version has no quote
  readonly evidenceQuote: string | null;
}

// Opens a version for the memory view: shredded once the item's key is gone, and unreadable when
// the key or the ciphertext fails.
export async function readViewText(
  key: CryptoKey | null | undefined,
  version: SealedVersion,
): Promise<OpenedVersion> {
  if (key === undefined) {
    return { text: { status: 'shredded' }, evidenceQuote: null };
  }

  if (key === null) {
    return { text: { status: 'unreadable' }, evidenceQuote: null };
  }

  try {
    const opened = await decodeVersionText(key, version, version.sealed);

    return { text: { status: 'readable', text: opened.text }, evidenceQuote: opened.evidenceQuote };
  } catch {
    return { text: { status: 'unreadable' }, evidenceQuote: null };
  }
}
