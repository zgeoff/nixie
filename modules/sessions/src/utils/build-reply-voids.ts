import type { RecordInput } from '@heynixie/log';
import type { ModelRecordSource, ReplyVoidReason } from '@heynixie/models';
import { modelReplyVoidedCodec } from '@heynixie/models';

export interface DroppedReplies {
  // the sequences of the replies the attempt wrote and keeps no more
  readonly sequences: readonly number[];

  // the step run that wrote them
  readonly runID: string;
}

export interface ReplyVoids extends DroppedReplies {
  readonly reason: ReplyVoidReason;
}

export function buildReplyVoids(
  source: Pick<ModelRecordSource, 'definitions'>,
  voids: ReplyVoids,
  thread?: string,
): readonly RecordInput[] {
  return voids.sequences.map((sequence) => ({
    kind: modelReplyVoidedCodec.kind,
    definitions: source.definitions(),
    ...(thread === undefined ? {} : { thread }),
    payload: modelReplyVoidedCodec.encode({
      replySequence: sequence,
      runID: voids.runID,
      reason: voids.reason,
    }),
  }));
}
