import type { AdapterReply, TranscriptTurn } from '@heynixie/coding';
import type { ATCFleet } from '../call/connect-atc';
import { runATCCall } from '../call/run-atc-call';
import { collectTranscriptTurns } from './collect-transcript-turns';
import type { TranscriptRow } from './collect-transcript-turns';

// The last `tailTurns` turns of a session's transcript, which atc pages oldest first, or
// 'unsupported' for an agent with no transcript reader.
export async function readTranscriptTail(
  atc: ATCFleet,
  sessionID: string,
  tailTurns: number,
): Promise<AdapterReply<readonly TranscriptTurn[] | 'unsupported'>> {
  if (tailTurns === 0) {
    return { status: 'ok', value: [] };
  }

  const rows: TranscriptRow[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page = await readTranscriptPage(atc, sessionID, cursor);

    if (page.status === 'refused' && page.reason === 'unsupported') {
      return { status: 'ok', value: 'unsupported' };
    }

    if (page.status !== 'ok') {
      return page;
    }

    rows.push(...page.value.rows);

    if (!page.value.more) {
      return { status: 'ok', value: collectTranscriptTurns(rows, tailTurns) };
    }

    cursor = page.value.cursor;
  }
}

const pageLimit = 200;

function readTranscriptPage(atc: ATCFleet, sessionID: string, cursor: string | null) {
  return runATCCall(
    () =>
      atc.session.read({
        session: sessionID,
        limit: pageLimit,
        ...(cursor === null ? {} : { cursor }),
      }),
    { procedure: 'session.read', isKeyed: false },
  );
}
