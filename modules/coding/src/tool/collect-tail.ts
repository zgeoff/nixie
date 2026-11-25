import type { JSONObject } from '@heynixie/log';
import type { TranscriptTurn } from '../types';

// The newest turns, up to `count`, that fit together in `limit` characters, oldest first. The tail
// holds whole turns while they fit; when the newest turn alone is longer, it keeps the end of that
// turn's reply and its newest tool names.
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
    const tools = collectNewestTools(latest.tools, limit - user.length);
    const room = limit - user.length - tools.join('').length;

    // slice(-0) would keep the whole reply
    const assistant = room === 0 ? '' : latest.assistant.slice(-room);

    return { turns: [toTurn({ ...latest, user, assistant, tools })], cut: true };
  }

  return {
    turns: kept.toReversed().map((turn) => toTurn(turn)),
    cut: kept.length < newest.length,
  };
}

function measureTurn(turn: TranscriptTurn): number {
  return turn.user.length + turn.assistant.length + turn.tools.join('').length;
}

// The newest whole tool names that fit together in `room` characters, oldest first.
function collectNewestTools(tools: readonly string[], room: number): string[] {
  const kept: string[] = [];
  let used = 0;

  for (const tool of tools.toReversed()) {
    if (used + tool.length > room) {
      break;
    }

    kept.push(tool);

    used += tool.length;
  }

  return kept.toReversed();
}

function toTurn(turn: TranscriptTurn): JSONObject {
  return { user: turn.user, assistant: turn.assistant, tools: [...turn.tools] };
}
