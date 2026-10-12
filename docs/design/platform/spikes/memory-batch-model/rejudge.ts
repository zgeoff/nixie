import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildJudgeInput } from './build-judge-input.ts';
import type { JudgeSource } from './build-judge-input.ts';
import { conversation } from './conversation.ts';
import { runJudge } from './run-judge.ts';
import type { Verdicts } from './run-judge.ts';

// Runs the judge again over the candidates a recorded run holds, without calling the writer, and
// replaces each sample's labels in place.
const token = process.env['CLAUDE_CODE_OAUTH_TOKEN'];
if (token === undefined || token === '') {
  throw new Error('CLAUDE_CODE_OAUTH_TOKEN is not set');
}

interface RecordedRun {
  samples: { candidates: JudgeSource[]; judge: Verdicts }[];
}

const cwd = mkdtempSync(join(tmpdir(), 'memory-batch-model-'));
try {
  await Promise.all(
    process.argv.slice(2).map(async (path) => {
      const run = JSON.parse(readFileSync(path, 'utf8')) as RecordedRun;
      await Promise.all(
        run.samples.map(async (sample) => {
          sample.judge = await runJudge(conversation, buildJudgeInput(sample.candidates), {
            cwd,
            token,
          });
        }),
      );
      writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
      console.log(`rejudged ${path}`);
    }),
  );
} finally {
  rmSync(cwd, { force: true, recursive: true });
}
