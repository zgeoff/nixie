import { expect, test } from 'bun:test';
import { buildReleaseManifest } from './build-release-manifest';

test('it names each image by its version tag and digest', () => {
  expect(
    buildReleaseManifest({
      version: '0.9.0',
      commit: '4f1c2b7e9a0d3c5b6e8f1a2c4d6e8f0a1b3c5d7e',
      images: {
        server: `ghcr.io/example/nixie@sha256:${'a'.repeat(64)}`,
        web: `ghcr.io/example/nixie-web@sha256:${'b'.repeat(64)}`,
        conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
        fetch: `ghcr.io/example/nixie-fetch@sha256:${'d'.repeat(64)}`,
      },
      migrations: { since: 'v0.8.2', added: [], readableByReleaseBefore: true },
      configSchema: { since: 'v0.8.2', breaking: ['server.port: changes type to "string"'] },
    }),
  ).toMatchInlineSnapshot(`
    {
      "commit": "4f1c2b7e9a0d3c5b6e8f1a2c4d6e8f0a1b3c5d7e",
      "configSchema": {
        "asset": "config.schema.json",
        "breaking": [
          "server.port: changes type to "string"",
        ],
        "since": "v0.8.2",
      },
      "format": 1,
      "images": {
        "server": "ghcr.io/example/nixie:0.9.0@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "web": "ghcr.io/example/nixie-web:0.9.0@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      "migrations": {
        "added": [],
        "readableByReleaseBefore": true,
        "since": "v0.8.2",
      },
      "sandboxImages": {
        "conversation": "ghcr.io/example/nixie-conversation:0.9.0@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "fetch": "ghcr.io/example/nixie-fetch:0.9.0@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      },
      "tag": "v0.9.0",
      "version": "0.9.0",
    }
  `);
});

test('it builds the same manifest from the same inputs', () => {
  const inputs = {
    version: '0.9.0',
    commit: '4f1c2b7e9a0d3c5b6e8f1a2c4d6e8f0a1b3c5d7e',
    images: {
      server: `ghcr.io/example/nixie@sha256:${'a'.repeat(64)}`,
      web: `ghcr.io/example/nixie-web@sha256:${'b'.repeat(64)}`,
      conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
      fetch: `ghcr.io/example/nixie-fetch@sha256:${'d'.repeat(64)}`,
    },
    migrations: { since: null, added: [], readableByReleaseBefore: null },
    configSchema: { since: null, breaking: [] },
  };

  expect(buildReleaseManifest(inputs)).toStrictEqual(buildReleaseManifest(inputs));
});

test('it refuses an image that is not named by its digest', () => {
  expect(() =>
    buildReleaseManifest({
      version: '0.9.0',
      commit: '4f1c2b7e9a0d3c5b6e8f1a2c4d6e8f0a1b3c5d7e',
      images: {
        server: 'ghcr.io/example/nixie:0.9.0',
        web: `ghcr.io/example/nixie-web@sha256:${'b'.repeat(64)}`,
        conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
        fetch: `ghcr.io/example/nixie-fetch@sha256:${'d'.repeat(64)}`,
      },
      migrations: { since: null, added: [], readableByReleaseBefore: null },
      configSchema: { since: null, breaking: [] },
    }),
  ).toThrowWithMessage(Error, /"ghcr\.io\/example\/nixie:0\.9\.0" is not an image named/u);
});
