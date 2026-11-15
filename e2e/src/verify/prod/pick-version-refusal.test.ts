import { expect, test } from 'bun:test';
import { pickVersionRefusal } from './pick-version-refusal';

test('it reads the version of a ready pod on the template image', () => {
  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  expect(
    pickVersionRefusal({
      podImage: image,
      templateImage: image,
      isReady: true,
      expected: undefined,
    }),
  ).toStrictEqual({ kind: 'served', version: '0.73.0' });
});

test('it accepts the version the deploy expects', () => {
  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  expect(
    pickVersionRefusal({
      podImage: image,
      templateImage: image,
      isReady: true,
      expected: '0.73.0',
    }),
  ).toStrictEqual({ kind: 'served', version: '0.73.0' });
});

test('it refuses a pod on another version than the deploy expects', () => {
  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  expect(
    pickVersionRefusal({
      podImage: image,
      templateImage: image,
      isReady: true,
      expected: '0.74.0',
    }),
  ).toStrictEqual({
    kind: 'refused',
    message: "nixie's pod runs 0.73.0, and the deploy expects 0.74.0",
  });
});

test('it refuses a pod that the rollout has not replaced yet', () => {
  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  expect(
    pickVersionRefusal({
      podImage:
        'ghcr.io/zgeoff/nixie:0.72.0@sha256:0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
      templateImage: image,
      isReady: true,
      expected: undefined,
    }),
  ).toStrictEqual({
    kind: 'refused',
    message:
      "nixie's pod runs 0.72.0, and its StatefulSet asks for 0.73.0: the rollout has not finished",
  });
});

test('it refuses a pod that is not ready', () => {
  const image =
    'ghcr.io/zgeoff/nixie:0.73.0@sha256:5f2a9c4e7b1d3f6a8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f3a';

  expect(
    pickVersionRefusal({
      podImage: image,
      templateImage: image,
      isReady: false,
      expected: undefined,
    }),
  ).toStrictEqual({ kind: 'refused', message: "nixie's pod runs 0.73.0, and is not ready" });
});

test('it refuses an image with no version tag', () => {
  expect(
    pickVersionRefusal({
      podImage: 'ghcr.io/zgeoff/nixie:latest',
      templateImage: 'ghcr.io/zgeoff/nixie:latest',
      isReady: true,
      expected: undefined,
    }),
  ).toStrictEqual({
    kind: 'refused',
    message: "nixie's pod runs ghcr.io/zgeoff/nixie:latest, which names no version",
  });
});
