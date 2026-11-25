import type { SpeechEvent } from '@heynixie/calls';
import { raiseSpeechEvent } from '../session/raise-speech-event';
import type { GPTLiveSession, TranscriptSlice } from '../types';
import { joinSlices } from './join-slices';

// Raises the user's speech that no event holds yet, up to `throughMs` on the session's timeline,
// as one `heard` event. The later slices stay for the next one.
export function flushHeardSlices(session: GPTLiveSession, throughMs: number): void {
  const taken = session.heardSlices.filter((slice) => slice.startMs <= throughMs);

  session.heardSlices = session.heardSlices.filter((slice) => slice.startMs > throughMs);

  const event = toHeardEvent(taken);

  if (event !== null) {
    raiseSpeechEvent(session, event);
  }
}

function toHeardEvent(slices: readonly TranscriptSlice[]): SpeechEvent | null {
  const [first] = slices;
  const last = slices.at(-1);
  const text = joinSlices(slices);

  if (first === undefined || last === undefined || text === '') {
    return null;
  }

  return { kind: 'heard', text, startedAtMs: first.startMs, endedAtMs: last.endMs };
}
