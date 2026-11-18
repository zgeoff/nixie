import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildCodeRunTool } from '../code/build-code-run-tool';
import { buildStubSandboxAdapter } from './build-stub-sandbox-adapter';
import { makeStubCodeExec } from './make-stub-code-exec';
import { readCodeRunFiles } from './read-code-run-files';

export interface CodeRunFilesSeed {
  readonly thread: string;

  // the files the program writes, by path under the work folder, such as out/orders.csv
  readonly writes: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>;

  // a stdout longer than the result shows, which the run keeps as a stream file
  readonly longStdout?: boolean;
}

export interface SeededCodeRunFiles {
  readonly files: readonly { readonly file: string; readonly path: string }[];

  // the sequence of the code run's result record, which holds the files
  readonly resultSequence: number;
}

// Runs the code tool on a stand-in sandbox, so the log holds the result record and the file rows
// that a real run leaves.
export async function seedCodeRunFiles(
  log: Log,
  seed: CodeRunFilesSeed,
): Promise<SeededCodeRunFiles> {
  const tool = buildCodeRunTool({
    log,
    adapter: buildStubSandboxAdapter(() => Promise.resolve(0), {
      exec: makeStubCodeExec(() => ({
        writes: seed.writes,
        ...(seed.longStdout === true ? { stdout: 'x'.repeat(50_000) } : {}),
      })),
    }),
    clock: log.writer.clock,
    logger: () => {},
    image: 'nixie-code-dddddddddddd',
    imageLongEdge: 1568,
    readSkills: () => Promise.resolve({ kind: 'ok', skills: [] }),
  });

  const result = await runToolCall(
    { tool: 'code.run', input: { language: 'python', program: 'print(1)' }, toolUseID: null },
    {
      runID: 'seed-run',
      thread: seed.thread,
      logThread: seed.thread,
      tools: ['code.run'],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    {
      registry: buildToolRegistry([tool]),
      decide: buildAllowingDecisionPoint(),
      log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      queue: {
        enqueue: () => Promise.reject(new Error('code.run runs direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const [stored] = await readRecords(log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  invariant(stored, 'the code run wrote no result record');

  return {
    files: readCodeRunFiles(result).map((file) => ({ file: file.file, path: file.path })),
    resultSequence: stored.record.sequence,
  };
}
