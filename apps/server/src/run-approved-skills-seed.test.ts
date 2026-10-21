import { expect, mock, test } from 'bun:test';
import { runApprovedSkillsSeed } from './run-approved-skills-seed';

test('it wakes the export of the skills nixie wrote, before the server parts start', async () => {
  const wake = mock(() => {});

  await runApprovedSkillsSeed(null, { wake, stop: () => Promise.resolve() });

  expect(wake).toHaveBeenCalledOnce();
});

test('it runs with no export when the configuration names no definitions repo', async () => {
  await expect(runApprovedSkillsSeed(null, null)).toResolve();
});
