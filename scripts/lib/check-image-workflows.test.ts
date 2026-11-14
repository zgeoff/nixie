import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkImageWorkflows } from './check-image-workflows.ts';

function setupTest() {
  const workflows = join(import.meta.dir, '..', '..', '.github', 'workflows');

  return {
    release: readFileSync(join(workflows, 'release.yml'), 'utf8'),
    images: readFileSync(join(workflows, 'images.yml'), 'utf8'),
  };
}

test('it finds no problem in the release and Images workflows', () => {
  const ctx = setupTest();

  expect(checkImageWorkflows(ctx.release, ctx.images)).toStrictEqual([]);
});

test('it names the key whose release job is taken out', () => {
  const ctx = setupTest();

  const release = ctx.release.replace(
    '\n  fetch:\n    name: Release the fetch image',
    '\n  other:\n    name: Release the fetch image',
  );

  expect(checkImageWorkflows(release, ctx.images)).toStrictEqual([
    'the release workflow has no job for the image key fetch',
  ]);
});

test('it names the key whose Images build step is taken out', () => {
  const ctx = setupTest();
  const images = ctx.images.replace('        id: fetch\n', '        id: other\n');

  expect(checkImageWorkflows(ctx.release, images)).toStrictEqual([
    'the Images workflow has no build step with the id fetch',
  ]);
});

test('it names the key whose release job builds another Dockerfile', () => {
  const ctx = setupTest();

  const release = ctx.release.replace(
    'dockerfile: guests/fetch/Dockerfile',
    'dockerfile: guests/other/Dockerfile',
  );

  expect(checkImageWorkflows(release, ctx.images)).toStrictEqual([
    'the fetch release job does not build guests/fetch/Dockerfile',
  ]);
});

test('it names the key that the sandbox-manifest job does not need', () => {
  const ctx = setupTest();

  const release = ctx.release.replace(
    'needs: [resolve, conversation, fetch]',
    'needs: [resolve, conversation]',
  );

  expect(checkImageWorkflows(release, ctx.images)).toStrictEqual([
    'the sandbox-manifest job does not need the fetch release job',
  ]);
});
