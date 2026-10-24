// Prints the reply runs as one table per candidate: first audio, full answer audio, gaps, long
// silences, tool calls and cost, against the spike's pass criteria. Each run's recordings sit in
// recordings/<candidate>/ beside its file, and the report reads the silences from them.
// Usage: report-reply.ts <file.jsonl>...
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { findLongestSilence } from './find-longest-silence.ts';
import { findSoundSpan } from './find-sound-span.ts';
import type { HeardTurn } from './format-reply-report.ts';
import { formatReplyReport } from './format-reply-report.ts';
import { parseWav } from './parse-wav.ts';
import { replyRecord } from './reply-record.ts';

// The level under which the runners count a sample as silence.
const soundThreshold = 0.01;

const { positionals: files } = parseArgs({ allowPositionals: true, options: {} });
const turns: HeardTurn[] = (
  await Promise.all(
    files.map(async (file) =>
      Promise.all(
        (await Bun.file(file).text())
          .split('\n')
          .filter(Boolean)
          .map(async (line) => {
            const record = replyRecord.parse(JSON.parse(line));
            const path = join(dirname(file), 'recordings', record.candidate, record.recording);
            const recording = parseWav(await Bun.file(path).bytes());
            const speechEnd = Math.round((record.speechMs * recording.sampleRate) / 1000);
            const reply = recording.samples.subarray(speechEnd);
            const span = findSoundSpan(reply, soundThreshold);
            return span === undefined
              ? record
              : {
                  ...record,
                  longestSilenceMs: findLongestSilence({
                    end: span.end,
                    sampleRate: recording.sampleRate,
                    samples: reply,
                    start: span.start,
                    threshold: soundThreshold,
                  }),
                };
          }),
      ),
    ),
  )
).flat();
console.log(formatReplyReport(turns));
