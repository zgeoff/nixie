import { cutSettleMs } from '../constants';
import { raiseSpeechEvent } from '../session/raise-speech-event';
import { pickHeardChars } from '../text/pick-heard-chars';
import type { GPTLiveOptions, GPTLiveSession, SpokenLine } from '../types';
import { joinSlices } from './join-slices';

// The provider reports no cut, so the user starting to talk while an answer plays is one. After a
// short wait for the transcript of the last words, the event counts how much of the sent answer
// the speech up to that point covers.
export function startCut(options: GPTLiveOptions, session: GPTLiveSession, cutAtMs: number): void {
  const line = session.lines.find(
    (candidate) =>
      candidate.kind === 'answer' &&
      candidate.isPlaying &&
      !candidate.isCutting &&
      candidate.startMs !== null &&
      cutAtMs >= candidate.startMs,
  );

  if (line === undefined || line.handOffID === null) {
    return;
  }

  line.isCutting = true;

  const handOffID = line.handOffID;

  void raiseCut(options, session, { line, handOffID, cutAtMs });
}

interface CutPoint {
  readonly line: SpokenLine;
  readonly handOffID: string;
  readonly cutAtMs: number;
}

async function raiseCut(
  options: GPTLiveOptions,
  session: GPTLiveSession,
  cut: CutPoint,
): Promise<void> {
  await options.clock.sleep(cutSettleMs, session.stopping.signal);

  if (!session.isClosed) {
    cut.line.isCut = true;

    raiseSpeechEvent(session, {
      kind: 'cut',
      handOffID: cut.handOffID,
      heardChars: pickHeardChars(cut.line.sentText, readSpokenBefore(cut.line, cut.cutAtMs)),
    });
  }
}

function readSpokenBefore(line: SpokenLine, cutAtMs: number): string {
  return joinSlices(line.spoken.filter((slice) => slice.startMs < cutAtMs));
}
