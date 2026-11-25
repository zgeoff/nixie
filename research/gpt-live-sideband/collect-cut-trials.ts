// Reads each talk-over trial out of a cut probe's log. Session times come from GPT-Live's own
// timeline; the playback stop comes from the device's clock, against the start of your speech.
import { z } from 'zod';
import type { TimelineEntry } from './collect-timeline.ts';
import { pickHeardChars } from './pick-heard-chars.ts';

export interface CutTrial {
  // The first sideband event of another kind than speech within 5 s of the cut, or null.
  cutEvent: string | null;
  cutAtMs: number;
  heardChars: number;
  lastOutputAudioEndMs: number;
  playbackStopAfterMs: number | null;
  sentChars: number;
  spokenBeforeCut: string;
  trial: number;
}

const silentPeak = 0.01;
const loudPeak = 0.02;
const quietSpanMs = 300;
// Every event type the probe expects during speech. Any other type within the window after a cut
// could be the provider's report of it.
const speechEventTypes = new Set([
  'probe.mark',
  'session.input_audio.append',
  'session.input_transcript.delta',
  'session.output_audio.delta',
  'session.output_transcript.delta',
  'session.usage.updated',
]);
const cutWindowMs = 5000;

const sentAnswer = z.object({ client: z.string(), content: z.string() });
const timed = z.object({ end_ms: z.number(), start_ms: z.number() });

export function collectCutTrials(
  entries: readonly TimelineEntry[],
  playback: readonly { atMs: number; peak: number }[],
): CutTrial[] {
  const sideband = entries.filter((entry) => entry.connection === 'sideband');
  const trials: CutTrial[] = [];
  for (const [index, entry] of sideband.entries()) {
    if (entry.event.type !== 'probe.mark' || entry.event.label !== 'interrupt') {
      continue;
    }
    const trial = Number(entry.event.trial);
    const sent = sideband.find(
      (candidate) => candidate.event.type === 'session.commentary.append' && candidate.event.event_id === `answer_${trial}`,
    );
    const appended = sideband.find(
      (candidate) =>
        candidate.event.type === 'session.commentary.appended' && candidate.event.client_event_id === `answer_${trial}`,
    );
    const later = sideband.slice(index);
    const firstHeard = later.find((candidate) => candidate.event.type === 'session.input_transcript.delta');
    const spokeMark = later.find((candidate) => candidate.event.type === 'probe.mark' && candidate.event.label === 'spoke');
    if (!sent || !appended || !firstHeard) {
      continue;
    }
    const answer = sentAnswer.parse({ client: sent.event.event_id, content: sent.event.content });
    const fromMs = timed.parse(appended.event).start_ms;
    const cutAtMs = timed.parse(firstHeard.event).start_ms;
    const spokenBeforeCut = sideband
      .filter((candidate) => candidate.event.type === 'session.output_transcript.delta')
      .filter((candidate) => {
        const range = timed.parse(candidate.event);
        return range.start_ms >= fromMs && range.start_ms < cutAtMs;
      })
      .map((candidate) => String(candidate.event.delta))
      .join('');
    const lastOutputAudioEndMs = Math.max(
      0,
      ...sideband
        .filter((candidate) => candidate.event.type === 'session.output_audio.delta' && Number(candidate.event.peak) >= loudPeak)
        .map((candidate) => timed.parse(candidate.event))
        .filter((range) => range.start_ms >= fromMs && range.start_ms < cutAtMs + 600)
        .map((range) => range.end_ms),
    );
    const cutEvent = later.find(
      (candidate) =>
        candidate.receivedAtMs - entry.receivedAtMs <= cutWindowMs && !speechEventTypes.has(String(candidate.event.type)),
    );
    const speakStartMs = Number(spokeMark?.event.startedAtMs ?? Number.NaN);
    trials.push({
      cutAtMs,
      cutEvent: cutEvent ? String(cutEvent.event.type) : null,
      heardChars: pickHeardChars(answer.content, spokenBeforeCut),
      lastOutputAudioEndMs,
      playbackStopAfterMs: findPlaybackStop(playback, speakStartMs),
      sentChars: answer.content.length,
      spokenBeforeCut,
      trial,
    });
  }
  return trials;
}

// The time from the start of your speech until the device's speaker stays quiet for a while.
function findPlaybackStop(playback: readonly { atMs: number; peak: number }[], fromMs: number): number | null {
  let quietSinceMs: number | null = null;
  for (const level of playback) {
    if (level.atMs < fromMs) {
      continue;
    }
    if (level.peak >= silentPeak) {
      quietSinceMs = null;
      continue;
    }
    quietSinceMs ??= level.atMs;
    if (level.atMs - quietSinceMs >= quietSpanMs) {
      return quietSinceMs - fromMs;
    }
  }
  return null;
}
