import { expect, test } from 'bun:test';
import { collectExtraPaths, pickSourceRefusal } from './pick-source-refusal';

test('#pickSourceRefusal accepts a container that holds every committed file unchanged', () => {
  const refusal = pickSourceRefusal({
    container: 'nixie',
    committed: [
      '100644 blob 1a2b3c4d\tapps/server/src/main.ts',
      '100644 blob 5e6f7a8b\tlibs/db/src/open.ts',
    ].join('\n'),
    served: ['1a2b3c4d apps/server/src/main.ts', '5e6f7a8b libs/db/src/open.ts'].join('\n'),
    ignored: new Set(),
  });

  expect(refusal).toBeNull();
});

test('#pickSourceRefusal refuses a container that holds an older copy of a committed file', () => {
  const refusal = pickSourceRefusal({
    container: 'nixie',
    committed: '100644 blob 1a2b3c4d\tapps/server/src/main.ts',
    served: '7f7f7f7f apps/server/src/main.ts',
    ignored: new Set(),
  });

  expect(refusal).toBe(
    'the running nixie container holds other sources than this tree in 1 files, such as apps/server/src/main.ts',
  );
});

test('#pickSourceRefusal refuses a container that lacks a committed file', () => {
  const refusal = pickSourceRefusal({
    container: 'nixie',
    committed: '100644 blob 1a2b3c4d\tmodules/memory/src/recall.ts',
    served: '',
    ignored: new Set(),
  });

  expect(refusal).toBe(
    'the running nixie container holds other sources than this tree in 1 files, such as modules/memory/src/recall.ts',
  );
});

test('#pickSourceRefusal refuses a container that holds a file the commit deleted', () => {
  const refusal = pickSourceRefusal({
    container: 'web',
    committed: '100644 blob 1a2b3c4d\tapps/web/src/routes/index.tsx',
    served: [
      '1a2b3c4d apps/web/src/routes/index.tsx',
      '9e9e9e9e apps/web/src/routes/garden.tsx',
    ].join('\n'),
    ignored: new Set(),
  });

  expect(refusal).toBe(
    'the running web container holds other sources than this tree in 1 files, such as apps/web/src/routes/garden.tsx',
  );
});

test('#pickSourceRefusal accepts a file the commit lacks when git ignores it', () => {
  const refusal = pickSourceRefusal({
    container: 'web',
    committed: '100644 blob 1a2b3c4d\tapps/web/src/routes/index.tsx',
    served: [
      '1a2b3c4d apps/web/src/routes/index.tsx',
      '9e9e9e9e apps/web/src/route-tree.gen.ts',
    ].join('\n'),
    ignored: new Set(['apps/web/src/route-tree.gen.ts']),
  });

  expect(refusal).toBeNull();
});

test('#pickSourceRefusal accepts a container that lacks a committed .env file or dist folder', () => {
  const refusal = pickSourceRefusal({
    container: 'nixie',
    committed: [
      '100644 blob 1a2b3c4d\tapps/web/.env.example',
      '100644 blob 5e6f7a8b\tlibs/kit/dist/index.js',
    ].join('\n'),
    served: '',
    ignored: new Set(),
  });

  expect(refusal).toBeNull();
});

test('#collectExtraPaths lists the paths a container holds that the commit lacks', () => {
  const extras = collectExtraPaths(
    '100644 blob 1a2b3c4d\tapps/web/src/routes/index.tsx',
    ['1a2b3c4d apps/web/src/routes/index.tsx', '9e9e9e9e apps/web/src/routes/garden.tsx'].join(
      '\n',
    ),
  );

  expect(extras).toStrictEqual(['apps/web/src/routes/garden.tsx']);
});
