import { expect, test } from 'bun:test';
import { buildRuntimeOverlay } from './build-runtime-overlay';

test('it keeps a runtime change in force over the seeded version beneath it', () => {
  const overlay = buildRuntimeOverlay({
    seeded: [{ key: 'kettle', hash: 'hash-seeded', value: 'seeded kettle' }],
    changes: [{ key: 'kettle', hash: 'hash-runtime', value: 'runtime kettle' }],
  });

  expect(overlay).toStrictEqual({
    inForce: [{ change: 'runtime kettle', beneath: 'seeded kettle' }],
    adopted: [],
  });
});

test('it keeps a runtime change in force with nothing beneath when the seed lacks its key', () => {
  const overlay = buildRuntimeOverlay({
    seeded: [{ key: 'teapot', hash: 'hash-teapot', value: 'seeded teapot' }],
    changes: [{ key: 'kettle', hash: 'hash-runtime', value: 'runtime kettle' }],
  });

  expect(overlay).toStrictEqual({
    inForce: [{ change: 'runtime kettle', beneath: null }],
    adopted: [],
  });
});

test('it adopts a runtime change once the seed holds the same version', () => {
  const overlay = buildRuntimeOverlay({
    seeded: [{ key: 'kettle', hash: 'hash-runtime', value: 'seeded kettle' }],
    changes: [{ key: 'kettle', hash: 'hash-runtime', value: 'runtime kettle' }],
  });

  expect(overlay).toStrictEqual({ inForce: [], adopted: ['runtime kettle'] });
});

test('it adopts a runtime removal once the seed lacks the key too', () => {
  const overlay = buildRuntimeOverlay({
    seeded: [],
    changes: [{ key: 'kettle', hash: null, value: 'removed kettle' }],
  });

  expect(overlay).toStrictEqual({ inForce: [], adopted: ['removed kettle'] });
});

test('it keeps a runtime removal in force while the seed still holds the key', () => {
  const overlay = buildRuntimeOverlay({
    seeded: [{ key: 'kettle', hash: 'hash-seeded', value: 'seeded kettle' }],
    changes: [{ key: 'kettle', hash: null, value: 'removed kettle' }],
  });

  expect(overlay).toStrictEqual({
    inForce: [{ change: 'removed kettle', beneath: 'seeded kettle' }],
    adopted: [],
  });
});
