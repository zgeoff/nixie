import { expect, test } from 'bun:test';
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default';
import { parseConventionalCommits } from 'release-please/build/src/commit';
import { hasBreakingMarker } from './has-breaking-marker';

test.each([
  ['feat!: rename the server port', true],
  ['feat(geo-12)!: rename the server port', true],
  ['fix(config)!: refuse an empty data directory', true],
  ['feat(geo-12): rename the server port', false],
  ['feat: add a log level', false],
  ['feat(geo-12) !: rename the server port', false],
  ['feat(geo-12)!:rename the server port', false],
  ['revert the server port rename!', false],
])('it reads %p as marked breaking: %p', (header, expected) => {
  expect(hasBreakingMarker(header)).toBe(expected);
});

// release-please parses each squash commit on main, so the title check holds only while the two
// agree on which headers mark a breaking change
test.each([
  'feat!: rename the server port',
  'feat(geo-12)!: rename the server port',
  'fix(config)!: refuse an empty data directory',
  'feat(geo-12): rename the server port',
  'feat: add a log level',
])('it agrees with release-please on whether %p is breaking', (header) => {
  const commits = parseConventionalCommits([{ sha: '4f1c2b7', message: header, files: [] }]);

  expect(commits.some((commit) => commit.breaking)).toBe(hasBreakingMarker(header));
});

test('it marks a title that release-please lists under the breaking changes of the changelog', async () => {
  const commits = parseConventionalCommits([
    { sha: '4f1c2b7', message: 'feat(geo-12)!: rename the server port', files: [] },
    { sha: '9a0d3c5', message: 'feat(geo-13): add a log level', files: [] },
  ]);

  const notes = await new DefaultChangelogNotes().buildNotes(commits, {
    owner: 'example',
    repository: 'nixie',
    version: '0.9.0',
    previousTag: 'v0.8.0',
    currentTag: 'v0.9.0',
    targetBranch: 'main',
  });

  expect(notes).toInclude('### ⚠ BREAKING CHANGES\n\n* **geo-12:** rename the server port\n');
});
