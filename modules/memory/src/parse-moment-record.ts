import type { EnvelopeRecord } from '@heynixie/log';
import { momentDestroyedCodec } from './moment-destroyed-codec';
import { momentEditedCodec } from './moment-edited-codec';
import { momentKeptCodec } from './moment-kept-codec';
import { momentLinkedCodec } from './moment-linked-codec';
import { momentRetiredCodec } from './moment-retired-codec';

type Decoded<Codec extends { readonly decode: (...args: never[]) => unknown }> = ReturnType<
  Codec['decode']
>;

export type MomentRecord =
  | ({ readonly kind: 'moment_kept' } & Decoded<typeof momentKeptCodec>)
  | ({ readonly kind: 'moment_edited' } & Decoded<typeof momentEditedCodec>)
  | ({ readonly kind: 'moment_linked' } & Decoded<typeof momentLinkedCodec>)
  | ({ readonly kind: 'moment_retired' } & Decoded<typeof momentRetiredCodec>)
  | ({ readonly kind: 'moment_destroyed' } & Decoded<typeof momentDestroyedCodec>);

export function parseMomentRecord(record: EnvelopeRecord): MomentRecord | null {
  if (record.kind === 'moment_kept') {
    return { kind: record.kind, ...momentKeptCodec.decode(record.payload) };
  }

  if (record.kind === 'moment_edited') {
    return { kind: record.kind, ...momentEditedCodec.decode(record.payload) };
  }

  if (record.kind === 'moment_linked') {
    return { kind: record.kind, ...momentLinkedCodec.decode(record.payload) };
  }

  if (record.kind === 'moment_retired') {
    return { kind: record.kind, ...momentRetiredCodec.decode(record.payload) };
  }

  if (record.kind === 'moment_destroyed') {
    return { kind: record.kind, ...momentDestroyedCodec.decode(record.payload) };
  }

  return null;
}
