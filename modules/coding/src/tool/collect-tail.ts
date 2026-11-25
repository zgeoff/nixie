import type { JSONObject } from '@heynixie/log';
import type { TranscriptTurn } from '../types';

// The newest turns, up to `count`, that fit together in `limit` characters, oldest first. The tail
// holds whole turns while they fit; when the newest turn alone is longer, it keeps the end of that
// turn's reply.
export function collectTail(
  turns: readonly TranscriptTurn[],
  count: number,
  limit: number,
): JSONObject {
  const newest = turns.slice(-count).toReversed();
  const kept: TranscriptTurn[] = [];
  let used = 0;

  for (const turn of newest) {
    const size = measureTurn(turn);

    if (used + size > limit) {
      break;
    }

    kept.push(turn);

    used += size;
  }

  const [latest] = newest;

  if (kept.length === 0 && latest !== undefined) {
    const user = latest.user.slice(-limit);
    const room = Math.max(0, limit - user.length - latest.tools.join('').length);

    // slice(-0) would keep the whole reply
    const assistant = room === 0 ? '' : latest.assistant.slice(-room);

    return { turns: [toTurn({ ...latest, user, assistant })], cut: true };
  }

  return {
    turns: kept.toReversed().map((turn) => toTurn(turn)),
    cut: kept.length < newest.length,
  };
}

function measureTurn(turn: TranscriptTurn): number {
  return turn.user.length + turn.assistant.length + turn.tools.join('').length;
}

function toTurn(turn: TranscriptTurn): JSONObject {
  return { user: turn.user, assistant: turn.assistant, tools: [...turn.tools] };
}
