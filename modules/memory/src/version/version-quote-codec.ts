import { z } from 'zod';
import type { QuoteEvidence } from '../types';
import { defineSealedCodec } from '../utils/codec/define-sealed-codec';

const inner = defineSealedCodec('quote-inner/', z.string());
const outer = defineSealedCodec('quote-outer/', z.string());

export type QuoteKind = 'evidence' | 'intent';

interface OuterRef {
  readonly itemID: string;
  readonly version: number;
  readonly quote: QuoteKind;
}

interface InnerRef {
  readonly itemID: string;
  readonly evidence: QuoteEvidence;
}

// A quote of a version that has its own key sits sealed twice. The inner seal is under the quoted
// record's key and binds the item, the record and the offsets, so a retire, a restore and an undo
// copy it unchanged. The outer seal is under the version's key.
export const versionQuoteCodec = {
  sealInner: (key: CryptoKey, ref: InnerRef, quote: string): Promise<string> =>
    inner.encode(key, buildInnerPlace(ref), quote),
  openInner: (key: CryptoKey, ref: InnerRef, sealed: string): Promise<string> =>
    inner.decode(key, buildInnerPlace(ref), sealed),
  sealOuter: (key: CryptoKey, ref: OuterRef, sealedInner: string): Promise<string> =>
    outer.encode(key, buildOuterPlace(ref), sealedInner),
  openOuter: (key: CryptoKey, ref: OuterRef, sealed: string): Promise<string> =>
    outer.decode(key, buildOuterPlace(ref), sealed),
};

function buildInnerPlace(ref: InnerRef): string {
  const evidence = ref.evidence;

  return [ref.itemID, evidence.recordSequence, evidence.start, evidence.end].map(String).join('/');
}

function buildOuterPlace(ref: OuterRef): string {
  return `${ref.itemID}/${String(ref.version)}/${ref.quote}`;
}
