import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collectMigrationFileNames } from './collect-migration-file-names';
import { nixieSchema } from './nixie-schema';
import { parseMigrationFileName } from './parse-migration-file-name';

test('it loads the released migrations from their files in released order, each numbered by its position', async () => {
  // the first 40 migrations as released; a later migration adds a file of its own, so this list
  // never grows
  const released = [
    ['0001-event-log-migration.ts', 'create the event log'],
    ['0002-definitions-migration.ts', 'create the definitions tables'],
    ['0003-sandboxes-migration.ts', 'create the sandboxes projection'],
    ['0004-tasks-migration.ts', 'create the tasks, timers and leases'],
    ['0005-actions-migration.ts', 'create the actions projection'],
    [
      '0006-api-migration.ts',
      'create the identity record, enrolment codes, client actions and refusals',
    ],
    ['0007-memory-migration.ts', 'create the memory projections'],
    ['0008-memory-writer-migration.ts', 'create the memory writer projection'],
    ['0009-memory-gate-migration.ts', 'create the memory gate tables'],
    ['0010-memory-proposal-merges-migration.ts', 'create the memory proposal merges table'],
    ['0011-memory-short-ids-migration.ts', 'add a short ID to each memory item'],
    ['0012-memory-consolidation-migration.ts', 'create the memory consolidation tables'],
    [
      '0013-memory-consolidation-comments-migration.ts',
      'add a short ID and a comment to each consolidation change',
    ],
    [
      '0014-memory-consolidation-summary-migration.ts',
      'add a sealed summary to each consolidation run',
    ],
    ['0015-record-attachments-migration.ts', 'add the sealed attachments of a record'],
    ['0016-memory-kinds-migration.ts', 'add a kind to each memory item and proposal'],
    ['0017-skills-migration.ts', 'create the skill tables'],
    ['0018-memory-subjects-migration.ts', 'add a subject to each memory item and proposal'],
    ['0019-written-skills-migration.ts', 'create the store of skills that nixie writes'],
    ['0020-skill-exports-migration.ts', 'create the export state of skills that nixie writes'],
    ['0021-skill-export-attempts-migration.ts', 'create the marks of skill exports in flight'],
    ['0022-web-fetch-links-migration.ts', 'create the link store of the web fetch tool'],
    [
      '0023-memory-until-migration.ts',
      'add an end time to each memory version and item, and the lapse origin',
    ],
    [
      '0024-definition-seed-repository-migration.ts',
      'add the repository that each definitions seed came from',
    ],
    ['0025-memory-pin-proposals-migration.ts', 'admit the pin operation in memory proposals'],
    [
      '0026-prompt-approvals-migration.ts',
      'create the approved prompt overrides and their export state',
    ],
    ['0027-task-messages-migration.ts', 'create the task messages and the hop of each task step'],
    ['0028-moments-migration.ts', 'create the moments, their reflections, links and text records'],
    ['0029-memory-sensitive-migration.ts', 'add a sensitive flag to each memory item and proposal'],
    [
      '0030-task-routes-migration.ts',
      'record who started each task, in which step, and where each routed message went',
    ],
    [
      '0031-memory-subject-changes-migration.ts',
      'add the subject changes of memory proposals and versions',
    ],
    [
      '0032-task-controls-migration.ts',
      'record a pause asked of a running task, the state a resume returns to, and each timer a stop withdrew',
    ],
    [
      '0033-action-cancel-migration.ts',
      'record the stop that cancelled each action before its first attempt',
    ],
    ['0034-backup-sets-migration.ts', 'create the backup sets and their receipts'],
    ['0035-drop-message-routes-migration.ts', 'drop the table of where each routed message went'],
    ['0036-search-calls-migration.ts', "create the search tool's count of calls a day"],
    ['0037-web-fetch-pages-migration.ts', 'create the page store of the web fetch tool'],
    [
      '0038-backup-notices-migration.ts',
      'create the notices of failed and missing backup receipts',
    ],
    ['0039-rules-migration.ts', 'create the rule store'],
    ['0040-rule-exports-migration.ts', 'create the rule exports'],
  ];

  const entries = await readdir(join(import.meta.dir, 'migrations'));

  const fileNames = collectMigrationFileNames(entries);

  expect(
    fileNames
      .slice(0, released.length)
      .map((fileName, index) => [
        fileName,
        nixieSchema.migrations[index]?.name,
        parseMigrationFileName(fileName) === index + 1,
      ]),
  ).toStrictEqual(released.map(([fileName, name]) => [fileName, name, true]));
});

test('it keeps 35 as the oldest reader', () => {
  expect(nixieSchema.oldestReader).toBe(35);
});
