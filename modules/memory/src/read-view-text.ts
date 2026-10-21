import { decodeVersionText } from './decode-version-text';
import type { ViewText } from './view-types';

export interface SealedVersion {
  readonly itemID: string;
  readonly version: number;
  readonly sealed: string;
}

export interface OpenedVersion {
  readonly text: ViewText;

  readonly evidenceQuote: string | null;
}

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
