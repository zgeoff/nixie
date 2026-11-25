// Reads one long-hold trial out of its session's log. The output transcript splits into 3 windows on
// GPT-Live's session timeline: before the holding line was accepted, the hold until the answer was
// accepted, and after. With no holding line, the first window runs to the answer.
import { z } from 'zod';
import { collectNewWords } from './collect-new-words.ts';
import type { TimelineEntry } from './collect-timeline.ts';

export interface HoldTrial {
  // The answer's commentary.appended arrived.
  answerAccepted: boolean;
  answerSet: number;
  delegated: boolean;
  // error events from either connection, and a session.closed the probe did not ask for.
  errors: string[];
  holdMs: number;
  line: string | null;
  lineAccepted: boolean;
  // Words said after the answer was accepted that appear nowhere in it.
  newWords: string[];
  saidAfterAnswer: string;
  saidBeforeLine: string;
  // Each stretch of speech in the hold, split on 600 ms of silence, with its start after the
  // holding line was accepted.
  saidInHold: { afterLineMs: number; text: string }[];
}

const utteranceGapMs = 600;

const trialMark = z.object({
  answer: z.string(),
  answerSet: z.number(),
  holdMs: z.number(),
  line: z.string().nullable(),
});
const timed = z.object({ end_ms: z.number(), start_ms: z.number() });
const appended = z.object({ client_event_id: z.string(), start_ms: z.number() });

export function collectHoldTrial(entries: readonly TimelineEntry[]): HoldTrial {
  const mark = entries.find((entry) => entry.event.type === 'probe.mark' && entry.event.label === 'hold_trial');
  const trial = trialMark.parse(mark?.event);
  const sideband = entries.filter((entry) => entry.connection === 'sideband');
  const acceptedAtMs = new Map(
    sideband
      .filter((entry) => entry.event.type === 'session.commentary.appended')
      .map((entry) => appended.parse(entry.event))
      .map((event) => [event.client_event_id, event.start_ms]),
  );
  const said = sideband
    .filter((entry) => entry.event.type === 'session.output_transcript.delta')
    .map((entry) => ({ ...timed.parse(entry.event), text: String(entry.event.delta) }));
  const lineAtMs = acceptedAtMs.get('holding_line');
  const answerAtMs = acceptedAtMs.get('answer') ?? Number.POSITIVE_INFINITY;
  const holdStartMs = lineAtMs ?? answerAtMs;
  const closeAsked = entries.findIndex((entry) => entry.event.type === 'session.close');
  const errors = entries
    .filter(
      (entry, index) =>
        entry.event.type === 'error' ||
        (entry.event.type === 'session.closed' && (closeAsked === -1 || index < closeAsked)),
    )
    .map((entry) => `${entry.connection} ${JSON.stringify(entry.event)}`);
  const saidAfterAnswer = joinSaid(said.filter((slice) => slice.start_ms >= answerAtMs));
  return {
    answerAccepted: acceptedAtMs.has('answer'),
    answerSet: trial.answerSet,
    delegated: sideband.some((entry) => entry.event.type === 'session.delegation.created'),
    errors,
    holdMs: trial.holdMs,
    line: trial.line,
    lineAccepted: lineAtMs !== undefined,
    newWords: collectNewWords(trial.answer, saidAfterAnswer),
    saidAfterAnswer,
    saidBeforeLine: joinSaid(said.filter((slice) => slice.start_ms < holdStartMs)),
    saidInHold: collectUtterances(said.filter((slice) => slice.start_ms >= holdStartMs && slice.start_ms < answerAtMs)).map(
      (utterance) => ({ afterLineMs: utterance.startMs - holdStartMs, text: utterance.text }),
    ),
  };
}

function joinSaid(slices: readonly { text: string }[]): string {
  return slices
    .map((slice) => slice.text)
    .join('')
    .trim();
}

function collectUtterances(
  slices: readonly { end_ms: number; start_ms: number; text: string }[],
): { startMs: number; text: string }[] {
  const utterances: { endMs: number; startMs: number; text: string }[] = [];
  for (const slice of slices) {
    const last = utterances.at(-1);
    if (last && slice.start_ms - last.endMs <= utteranceGapMs) {
      last.text += slice.text;
      last.endMs = slice.end_ms;
    } else {
      utterances.push({ endMs: slice.end_ms, startMs: slice.start_ms, text: slice.text });
    }
  }
  return utterances.map((utterance) => ({ startMs: utterance.startMs, text: utterance.text.trim() }));
}
