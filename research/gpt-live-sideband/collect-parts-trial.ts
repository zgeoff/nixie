// Reads one sentence-parts trial out of its session's log. Send times and arrivals use the server's
// clock; pauses in the reflected output audio use GPT-Live's session timeline.
import { z } from 'zod';
import { collectNewWords } from './collect-new-words.ts';
import type { TimelineEntry } from './collect-timeline.ts';

export interface PartsTrial {
  answerSet: number;
  delegated: boolean;
  // From sending the first part to the first loud reflected output audio, on the server's clock.
  firstAudioAfterMs: number | null;
  gapMs: number;
  // From the first loud output audio to sending the last part; negative when every part was sent
  // before GPT-Live started speaking.
  lastPartAfterFirstAudioMs: number | null;
  // The longest silence inside the spoken answer, between loud output audio spans.
  longestPauseMs: number;
  // Words not in any part, said after the first part was sent and before the last.
  newWordsBeforeLastPart: string[];
  // Words not in any part, said at any time.
  newWords: string[];
  parts: string[];
  shape: string;
  // For each part after the first: how long the reflected output audio had been quiet when the part
  // was sent, or 0 while GPT-Live was still speaking. Null before GPT-Live first spoke.
  silentBeforePartsMs: (number | null)[];
  // Speech the hold should have kept back: everything said before the first part was sent.
  spokenBeforeFirstPart: string;
  spoken: string;
}

const loudPeak = 0.02;

const trialMark = z.object({ answerSet: z.number(), gapMs: z.number(), shape: z.string() });
const sentPart = z.object({ content: z.string(), event_id: z.string().startsWith('part_') });
const timed = z.object({ end_ms: z.number(), start_ms: z.number() });

export function collectPartsTrial(entries: readonly TimelineEntry[]): PartsTrial {
  const sideband = entries.filter((entry) => entry.connection === 'sideband');
  const mark = sideband.find((entry) => entry.event.type === 'probe.mark' && entry.event.label === 'parts_trial');
  const trial = trialMark.parse(mark?.event);
  const sends = sideband
    .filter((entry) => entry.event.sent === true && entry.event.type === 'session.commentary.append')
    .map((entry) => ({ atMs: entry.receivedAtMs, ...sentPart.parse(entry.event) }));
  const said = sideband
    .filter((entry) => entry.event.type === 'session.output_transcript.delta')
    .map((entry) => ({ atMs: entry.receivedAtMs, text: String(entry.event.delta) }));
  const loud = sideband
    .filter((entry) => entry.event.type === 'session.output_audio.delta' && Number(entry.event.peak) >= loudPeak)
    .map((entry) => ({ atMs: entry.receivedAtMs, ...timed.parse(entry.event) }));
  const delegated = sideband.some((entry) => entry.event.type === 'session.delegation.created');
  const parts = sends.map((send) => send.content);
  const partsText = parts.join(' ');
  const firstSendAtMs = sends[0]?.atMs ?? Number.POSITIVE_INFINITY;
  const lastSendAtMs = sends.at(-1)?.atMs ?? Number.POSITIVE_INFINITY;
  const firstAudio = loud.find((chunk) => chunk.atMs >= firstSendAtMs);
  const spoken = said.map((slice) => slice.text).join('');
  return {
    ...trial,
    delegated,
    firstAudioAfterMs: firstAudio ? firstAudio.atMs - firstSendAtMs : null,
    lastPartAfterFirstAudioMs: firstAudio ? lastSendAtMs - firstAudio.atMs : null,
    longestPauseMs: pickLongestPause(loud.filter((chunk) => chunk.atMs >= firstSendAtMs)),
    newWords: collectNewWords(partsText, spoken),
    newWordsBeforeLastPart: collectNewWords(
      partsText,
      said
        .filter((slice) => slice.atMs >= firstSendAtMs && slice.atMs < lastSendAtMs)
        .map((slice) => slice.text)
        .join(''),
    ),
    parts,
    silentBeforePartsMs: sends.slice(1).map((send) => {
      const appended = sideband.find(
        (entry) => entry.event.type === 'session.commentary.appended' && entry.event.client_event_id === send.event_id,
      );
      return appended ? pickSilenceMs(loud, timed.parse(appended.event).start_ms) : null;
    }),
    spoken: spoken.trim(),
    spokenBeforeFirstPart: said
      .filter((slice) => slice.atMs < firstSendAtMs)
      .map((slice) => slice.text)
      .join('')
      .trim(),
  };
}

// On the session timeline: the time since the last loud output audio ended when the part was
// accepted, 0 while a loud chunk was still playing.
function pickSilenceMs(loud: readonly { end_ms: number; start_ms: number }[], appendedAtMs: number): number | null {
  const last = loud.findLast((chunk) => chunk.start_ms <= appendedAtMs);
  if (!last) {
    return null;
  }
  return Math.max(0, appendedAtMs - last.end_ms);
}

function pickLongestPause(chunks: readonly { end_ms: number; start_ms: number }[]): number {
  let longestMs = 0;
  for (const [index, chunk] of chunks.entries()) {
    const before = chunks[index - 1];
    if (before) {
      longestMs = Math.max(longestMs, chunk.start_ms - before.end_ms);
    }
  }
  return longestMs;
}
