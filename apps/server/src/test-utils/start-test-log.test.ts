import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestLog } from './start-test-log';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-log-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it starts a log with the tasks, sandboxes and memory projections and a fresh key', async () => {
  const ctx = await setupTest();
  const log = await startTestLog(ctx.dataDir);

  onTestFinished(() => log.writer.stop());

  expect(log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'nixie_pause',
    'pause_exemptions',
    'recoveries',
    'spend_stop',
    'tasks',
    'timers',
    'task_messages',
    'task_runs',
    'trigger_keys',
    'trigger_sources',
    'trigger_definitions',
    'wake_rules',
    'wake_rule_windows',
    'wake_held',
    'reminders',
    'sandboxes',
    'memory_items',
    'memory_versions',
    'memory_labels',
    'memory_proposals',
    'memory_proposal_merges',
    'memory_notice_entries',
    'memory_change_notices',
    'memory_forgotten_evidence',
    'memory_item_keys',
    'memory_evidence_purges',
    'moments',
    'moment_reflections',
    'moment_links',
    'moment_texts',
    'notebook_notes',
    'notebook_versions',
    'notebook_links',
    'known_contacts',
    'proposals',
  ]);

  expect(log.deploymentKey.algorithm).toMatchObject({ name: 'AES-KW', length: 256 });
});
