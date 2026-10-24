import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleTurnSchema } from './real-turns/build-sample.ts';
import { readJSONLines } from './real-turns/read-json-lines.ts';
import { sampleKeySchema } from './real-turns/score-turns.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'real-turns-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, cli: join(import.meta.dir, 'real-turns.ts') };
}

test('the sample command writes each chosen turn and a key whose references match its items', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'records.jsonl'),
    [
      '{"sequence":1,"recordedAt":"2026-03-02T08:00:00Z","kind":"owner_message","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"readable","fields":{"text":"what should I pack?"}}}',
      '{"sequence":2,"recordedAt":"2026-03-02T08:00:01Z","kind":"task.step_started","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"none"}}',
      '{"sequence":3,"recordedAt":"2026-03-02T08:00:02Z","kind":"memory.recalled","thread":"conversation","parent":null,"payload":{"items":[{"itemID":"item-a","version":1}],"searchMode":"hybrid"},"erasable":{"status":"none"}}',
      '{"sequence":4,"recordedAt":"2026-03-02T08:00:05Z","kind":"model.reply","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"readable","fields":{"text":"Pack light."}}}',
    ].join('\n'),
  );
  await writeFile(
    join(ctx.dir, 'memory-items.jsonl'),
    [
      '{"item_id":"item-a","version":1,"state":"active","is_pinned":0,"pinned_sequence":null,"created_sequence":0,"short_id":"M1","kind":"fact","subject":"owner"}',
      '{"item_id":"item-b","version":1,"state":"active","is_pinned":0,"pinned_sequence":null,"created_sequence":0,"short_id":"M2","kind":"fact","subject":"owner"}',
    ].join('\n'),
  );
  await writeFile(
    join(ctx.dir, 'memory-versions.jsonl'),
    [
      '{"item_id":"item-a","version":1,"change":"created","state":"active","sequence":0,"until":null,"status":"readable","text":"Packs light"}',
      '{"item_id":"item-b","version":1,"change":"created","state":"active","sequence":0,"until":null,"status":"readable","text":"Flies on Friday"}',
    ].join('\n'),
  );
  await writeFile(join(ctx.dir, 'rating-notes.jsonl'), '');

  const run = Bun.spawnSync(['bun', ctx.cli, 'sample', '--plain', ctx.dir, '--out', join(ctx.dir, 'sample.jsonl')]);
  const [turn] = await readJSONLines(join(ctx.dir, 'sample.jsonl'), sampleTurnSchema);
  const [key] = await readJSONLines(join(ctx.dir, 'sample-key.jsonl'), sampleKeySchema);

  expect(run.exitCode).toBe(0);
  expect(turn?.caseID).toBe('t3');
  expect(key?.caseID).toBe('t3');
  expect(Object.fromEntries((turn?.items ?? []).map((item) => [item.text, key?.refs[item.ref]]))).toStrictEqual({
    'Packs light': 'item-a',
    'Flies on Friday': 'item-b',
  });
});
