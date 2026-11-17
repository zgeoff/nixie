import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { JSONObject } from '@heynixie/log';
import { buildTaskExportChange } from './build-task-export-change';
import { renderTaskYAML } from './render-task-yaml';

// The definitions repo checks each exported task.yaml with its formatter, and nixie's tests never
// run a binary, so a CI script runs that formatter over these samples' export files.
const samples: readonly (readonly [string, JSONObject])[] = [
  [
    'rain-gauge',
    {
      name: 'Rain gauge: weekly total',
      brief: 'Read the gauge.',
      trigger: {
        schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
      },
    },
  ],
  [
    'call-the-vet',
    {
      name: 'Call the vet',
      brief: 'Book the "check-up" # not a comment\nand ask about shots.\n',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
    },
  ],
  [
    '2027',
    {
      name: '2027',
      brief: 'null',
      trigger: { schedule: { every: 'day', at: '04:00', zone: 'owner', catchUp: 'once' } },
      tools: [],
    },
  ],
  [
    'tidy-the-garden-shed',
    {
      name: 'Tidy the garden shed',
      brief: `${'Sort the tools by use and put the rarely used ones on the top shelf. '.repeat(6)}Done.`,
      trigger: { schedule: { every: 'day', at: '21:00', zone: 'owner', catchUp: 'once' } },
      tools: ['time.now'],
      memory: 'read',
      report: 'wake',
    },
  ],
  [
    'naive-cafe-check',
    {
      name: 'Naïve café check ☕',
      brief: 'Ask how the café is going.',
      trigger: { schedule: { every: 'day', at: '09:00', zone: 'owner', catchUp: 'once' } },
    },
  ],
];

export async function writeTaskYAMLSamples(directory: string): Promise<readonly string[]> {
  const change = buildTaskExportChange({
    changes: samples.map(([definitionID, mapping]) => ({
      changeID: `sample-${definitionID}`,
      definitionID,
      operation: 'add',
      base: null,
      definitions: null,
      version: {
        definitionID,
        hash: `sample-${definitionID}`,
        form: mapping,
        files: { [`tasks/${definitionID}/task.yaml`]: renderTaskYAML(mapping) },
      },
    })),
    folders: new Map(),
  });

  const written: string[] = [];

  for (const [path, text] of change.files) {
    if (text !== null) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), text);

      written.push(path);
    }
  }

  return written;
}
