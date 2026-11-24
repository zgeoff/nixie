import type { EnvelopeRecord } from '@heynixie/log';
import { erasureFinishedCodec, erasureStartedCodec } from '@heynixie/log';
import { momentRetiredCodec } from '../retired/moment-retired-codec';
import { momentDestroyedCodec } from './codec/moment-destroyed-codec';
import { momentEditedCodec } from './codec/moment-edited-codec';
import { momentKeptCodec } from './codec/moment-kept-codec';
import { momentLinkedCodec } from './codec/moment-linked-codec';

type Decoded<Codec extends { readonly decode: (...args: never[]) => unknown }> = ReturnType<
  Codec['decode']
>;

export type MomentRecord =
  | ({ readonly kind: 'moment_kept' } & Decoded<typeof momentKeptCodec>)
  | ({ readonly kind: 'moment_edited' } & Decoded<typeof momentEditedCodec>)
  | ({ readonly kind: 'moment_linked' } & Decoded<typeof momentLinkedCodec>)
  | ({ readonly kind: 'moment_retired' } & Decoded<typeof momentRetiredCodec>)
  | ({ readonly kind: 'moment_destroyed' } & Decoded<typeof momentDestroyedCodec>)
  | {
      readonly kind: 'moment_erasure';
      readonly momentID: string;
      readonly stage: 'started' | 'done';
    };

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

  if (record.kind === erasureStartedCodec.kind) {
    const started = erasureStartedCodec.decode(record.payload);

    return started.kind === 'moment'
      ? { kind: 'moment_erasure', momentID: started.targetID, stage: 'started' }
      : null;
  }

  if (record.kind === erasureFinishedCodec.kind) {
    const finished = erasureFinishedCodec.decode(record.payload);

    return finished.kind === 'moment'
      ? { kind: 'moment_erasure', momentID: finished.targetID, stage: 'done' }
      : null;
  }

  return null;
}
