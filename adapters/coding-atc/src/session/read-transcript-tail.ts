import type { AdapterReply, TranscriptTurn } from '@heynixie/coding';
import { atcSchemas } from '../atc-schemas';
import type { CallATC } from '../call/make-atc-caller';
import { toReply } from '../call/to-reply';
import { collectTranscriptTurns } from './collect-transcript-turns';
import type { TranscriptRow } from './collect-transcript-turns';

const pageLimit = 200;

// The last `tailTurns` turns of a session's transcript, which atc pages oldest first, or
// 'unsupported' for an agent with no transcript reader.
export async function readTranscriptTail(
  call: CallATC,
  sessionID: string,
  tailTurns: number,
): Promise<AdapterReply<readonly TranscriptTurn[] | 'unsupported'>> {
  if (tailTurns === 0) {
    return { status: 'ok', value: [] };
  }

  const rows: TranscriptRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    const outcome = await call('atc_transcript_read', {
      session: sessionID,
      limit: pageLimit,
      ...(cursor === null ? {} : { cursor }),
    });

    if (outcome.status === 'failed' && outcome.code === 'unsupported') {
      return { status: 'ok', value: 'unsupported' };
    }

    const page = toReply(outcome, atcSchemas.transcriptPage, {
      tool: 'atc_transcript_read',
      isKeyed: false,
    });

    if (page.status !== 'ok') {
      return page;
    }

    rows.push(...page.value.rows);

    if (page.value.more !== true || page.value.cursor === undefined) {
      return { status: 'ok', value: collectTranscriptTurns(rows, tailTurns) };
    }

    cursor = page.value.cursor;
  }
}
