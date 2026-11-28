import { expect, test } from 'bun:test';
import { buildMockTaskStartBounds } from '../test-utils/build-mock-task-start-bounds';
import { buildSandboxStartInput } from './build-sandbox-start-input';

test.each([
  {
    name: 'both meters have a default and a max',
    limits: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    description:
      "the task's turns and model cost in dollars; 25 turns and $2 unless you set them, and no limit on a meter with no default; at most 100 turns and $10",
  },
  {
    name: 'neither meter has a default or a max',
    limits: { default: { turns: null, dollars: null }, max: { turns: null, dollars: null } },
    description:
      "the task's turns and model cost in dollars; no limit on either unless you set one",
  },
  {
    name: 'only the turns have a default, and only the dollars have a max',
    limits: { default: { turns: 30, dollars: null }, max: { turns: null, dollars: 5 } },
    description:
      "the task's turns and model cost in dollars; 30 turns unless you set them, and no limit on a meter with no default; at most $5",
  },
])('it describes the limits of a start when $name', (row) => {
  const input = buildSandboxStartInput(buildMockTaskStartBounds({ limits: row.limits }));

  expect(input).toMatchObject({ properties: { limits: { description: row.description } } });
});
