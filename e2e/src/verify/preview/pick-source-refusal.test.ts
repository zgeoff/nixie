import { expect, test } from 'bun:test';
import { pickSourceRefusal } from './pick-source-refusal';

test('it accepts a container that holds every committed file unchanged', () => {
  const committed = [
    '100644 blob 1a2b3c4d\tapps/server/src/main.ts',
    '100644 blob 5e6f7a8b\tlibs/db/src/open.ts',
  ].join('\n');

  const served = [
    '1a2b3c4d apps/server/src/main.ts',
    '5e6f7a8b libs/db/src/open.ts',
    '9c0d1e2f apps/server/node_modules/zod/index.js',
  ].join('\n');

  expect(pickSourceRefusal(committed, served)).toBeNull();
});

test('it refuses a container that holds an older copy of a committed file', () => {
  const committed = '100644 blob 1a2b3c4d\tapps/server/src/main.ts';

  expect(pickSourceRefusal(committed, '7f7f7f7f apps/server/src/main.ts')).toBe(
    'the running preview holds other sources than this tree in 1 files, such as apps/server/src/main.ts',
  );
});

test('it refuses a container that lacks a committed file', () => {
  const committed = '100644 blob 1a2b3c4d\tmodules/memory/src/recall.ts';

  expect(pickSourceRefusal(committed, '')).toBe(
    'the running preview holds other sources than this tree in 1 files, such as modules/memory/src/recall.ts',
  );
});

test('it accepts a container that lacks a committed .env file, which the image build leaves out', () => {
  const committed = '100644 blob 1a2b3c4d\tapps/web/.env.example';

  expect(pickSourceRefusal(committed, '')).toBeNull();
});
