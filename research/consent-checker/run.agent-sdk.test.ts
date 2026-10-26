// oxlint-disable @stylistic/lines-around-comment -- turbo reads @boundaries-ignore only on the line above an import, and the import sort keeps no blank line there
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @boundaries-ignore the spike runs the label command against the conversation guest's stub model
import { startStubModel } from '../../guests/conversation/src/test-utils/start-stub-model.ts';
// @boundaries-ignore the spike reads its output the way the retrieval spike reads its files
import { readJSONLines } from '../memory-retrieval/real-turns/read-json-lines.ts';
import { labelLineSchema } from './consent/types.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'consent-run-sdk-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  return { directory, model, entry: join(import.meta.dir, 'run.ts') };
}

test('it asks the model for the labeller answer shape and records the label it returns', async () => {
  const ctx = await setupTest();

  const plainPath = join(ctx.directory, 'records.jsonl');
  const casesPath = join(ctx.directory, 'cases.jsonl');
  const personaPath = join(ctx.directory, 'persona.md');
  const outPath = join(ctx.directory, 'labels.jsonl');

  await writeFile(
    plainPath,
    [
      '{"sequence":1,"recordedAt":"2026-03-02T09:00:00Z","kind":"owner_message","thread":"conversation","parent":null,"payload":{"spans":"as_sent"},"erasable":{"status":"readable","fields":{"text":"look up the ferry times","spans":[]}}}',
      '{"sequence":2,"recordedAt":"2026-03-02T09:00:01Z","kind":"task.step_started","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"none"}}',
      '{"sequence":3,"recordedAt":"2026-03-02T09:00:02Z","kind":"tool_called","thread":"conversation","parent":null,"payload":{"tool":"web_fetch"},"erasable":{"status":"readable","fields":{"input":{"url":"https://ferry.example/times"}}}}',
      '',
    ].join('\n'),
  );

  await writeFile(
    casesPath,
    '{"caseID":"2/3","bucket":"natural","stepSequence":2,"messages":[{"sequence":1,"text":"look up the ferry times","spans":[]}],"call":{"sequence":3,"tool":"web_fetch","input":{"url":"https://ferry.example/times"}}}\n',
  );

  await writeFile(personaPath, 'A made-up persona.\n');

  ctx.model.addReplies({
    toolUse: {
      name: 'StructuredOutput',
      input: {
        calls: [{ call: 1, reason: 'the owner asked for the ferry times', label: 'asked' }],
      },
    },
  });

  const child = Bun.spawn(
    [
      'bun',
      ctx.entry,
      'label',
      '--plain',
      plainPath,
      '--cases',
      casesPath,
      '--persona',
      personaPath,
      '--out',
      outPath,
      '--home',
      join(ctx.directory, 'home'),
      '--base-url',
      ctx.model.url,
    ],
    { env: { ...process.env, ANTHROPIC_AUTH_TOKEN: 'test-token' }, stdout: 'pipe', stderr: 'pipe' },
  );

  const exitCode = await child.exited;

  const stderr = await new Response(child.stderr).text();

  const sent = ctx.model.requests.findLast((request) => request.path === '/v1/messages');
  const structuredOutput = sent?.body?.tools?.find((tool) => tool.name === 'StructuredOutput');

  const lines = await readJSONLines(outPath, labelLineSchema);

  expect({ exitCode, stderr }).toStrictEqual({ exitCode: 0, stderr: '' });

  expect(structuredOutput?.input_schema).toStrictEqual({
    type: 'object',
    properties: {
      calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            call: {
              type: 'integer',
              minimum: -9_007_199_254_740_991,
              maximum: 9_007_199_254_740_991,
            },
            reason: { type: 'string' },
            label: { type: 'string', enum: ['asked', 'not_asked', 'unsure'] },
          },
          required: ['call', 'reason', 'label'],
          additionalProperties: false,
        },
      },
    },
    required: ['calls'],
    additionalProperties: false,
  });

  expect(lines).toStrictEqual([
    { reservedFor: 'step 2', reserveUSD: 0.1 },
    {
      stepSequence: 2,
      model: 'claude-opus-5-5',
      effort: 'medium',
      promptSHA256: expect.any(String),
      labels: [{ caseID: '2/3', label: 'asked', reason: 'the owner asked for the ferry times' }],
      failure: null,
      costUSD: expect.any(Number),
    },
  ]);
});
