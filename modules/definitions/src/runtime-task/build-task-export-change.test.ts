import { expect, test } from 'bun:test';
import { buildTaskExportChange } from './build-task-export-change';

test('it accepts a definition ID with a double hyphen, as the seed does', () => {
  const change = buildTaskExportChange({
    changes: [
      {
        changeID: 'change-1',
        definitionID: 'water--the-tomatoes',
        operation: 'define',
        base: null,
        definitions: null,
        version: {
          definitionID: 'water--the-tomatoes',
          hash: 'hash-1',
          form: { name: 'Water' },
          files: { 'tasks/water--the-tomatoes/task.yaml': 'name: Water\n' },
        },
      },
    ],
    folders: new Map(),
  });

  expect([...change.files]).toStrictEqual([
    ['tasks/water--the-tomatoes/task.yaml', 'name: Water\n'],
  ]);
});

test('it rejects a definition ID that names a path outside its folder', () => {
  expect(() =>
    buildTaskExportChange({
      changes: [
        {
          changeID: 'change-1',
          definitionID: '../skills',
          operation: 'undefine',
          base: null,
          definitions: null,
          version: null,
        },
      ],
      folders: new Map(),
    }),
  ).toThrow();
});
