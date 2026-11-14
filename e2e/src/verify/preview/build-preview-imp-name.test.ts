import { expect, test } from 'bun:test';
import { buildPreviewImpName } from './build-preview-imp-name';

test('it names the imp after a hash of the repository and the pull request number', () => {
  expect(buildPreviewImpName('octo-garden/greenhouse', 42)).toMatch(/^pv-[0-9a-f]{8}-42$/u);
});

test('it gives the same name whatever the case of the repository', () => {
  expect(buildPreviewImpName('Octo-Garden/Greenhouse', 7)).toBe(
    buildPreviewImpName('octo-garden/greenhouse', 7),
  );
});
