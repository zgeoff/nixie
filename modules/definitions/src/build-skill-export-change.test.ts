import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildSkillExportChange } from './build-skill-export-change';
import { checkSkillFiles } from './check-skill-files';

test('it carries a new skill in its folder, and notes a conversation list that lacks it', () => {
  const version = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    { path: 'ports.md', text: '# Ports\n' },
  ]);

  invariant('skillHash' in version);

  const change = buildSkillExportChange({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    proposalID: 'k3vq8m2xpa',
    version,
    beneath: null,
    isBeneathVendored: false,
    lock: null,
    manifest: 'format: 2\nskills: [harbour-hours]\n',
  });

  expect(change).toStrictEqual({
    branch: 'nixie/skill/tide-tables',
    title: 'Add the tide-tables skill that nixie wrote',
    body: expect.toBeString(),
    files: new Map([
      [
        'skills/tide-tables/SKILL.md',
        '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n',
      ],
      ['skills/tide-tables/ports.md', '# Ports\n'],
    ]),
  });

  expect(change.body).toMatchInlineSnapshot(`
    "nixie wrote this version of the \`tide-tables\` skill, and an approval put it in force: approval \`5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31\`, proposal \`k3vq8m2xpa\`.

    Merge this pull request to make the skill yours: the next seed after the merge marks it as yours. A change to the skill on the base branch before the merge shows as a conflict, and \`nixie skill resolve\` keeps one side.

    nixie.yaml lists the conversation's skills. Add \`tide-tables\` to that list to keep the skill in the conversation after the merge.
    "
  `);
});

test('it leaves out the list note when nixie.yaml lists no skills', () => {
  const version = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in version);

  const change = buildSkillExportChange({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    proposalID: 'k3vq8m2xpa',
    version,
    beneath: null,
    isBeneathVendored: false,
    lock: null,
    manifest: 'format: 2\n',
  });

  expect(change.body).not.toInclude('nixie.yaml');
});

test('it replaces a vendored skill: it removes the files the new version lacks and the lock entry', () => {
  const beneath = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
    { path: 'old-ports.md', text: '# Old ports\n' },
  ]);

  const version = checkSkillFiles('tide-tables', [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
    },
  ]);

  invariant('skillHash' in beneath);
  invariant('skillHash' in version);

  const entry = {
    source: 'https://skills.test/tides',
    path: 'tide-tables',
    commit: 'a'.repeat(40),
    contentHash: 'b'.repeat(64),
  };

  const change = buildSkillExportChange({
    approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    proposalID: 'k3vq8m2xpa',
    version,
    beneath,
    isBeneathVendored: true,
    lock: JSON.stringify({ 'tide-tables': entry, 'harbour-hours': entry }),
    manifest: 'format: 2\nskills: [harbour-hours]\n',
  });

  expect(change).toStrictEqual({
    branch: 'nixie/skill/tide-tables',
    title: 'Update the tide-tables skill to the version nixie wrote',
    body: expect.toInclude('removes the lock entry of the vendored `tide-tables` skill'),
    files: new Map([
      [
        'skills/tide-tables/SKILL.md',
        '---\nname: tide-tables\ndescription: Reads a tide table.\n---\nBy port.\n',
      ],
      ['skills/tide-tables/old-ports.md', null],
      ['skills/skills.lock.json', `${JSON.stringify({ 'harbour-hours': entry }, null, 2)}\n`],
    ]),
  });
});

test('it refuses a lock file on the base branch that is not valid', () => {
  const version = checkSkillFiles('tide-tables', [
    { path: 'SKILL.md', text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n' },
  ]);

  invariant('skillHash' in version);

  expect(() =>
    buildSkillExportChange({
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      version,
      beneath: version,
      isBeneathVendored: true,
      lock: '{ not json',
      manifest: null,
    }),
  ).toThrowWithMessage(
    Error,
    'skills/skills.lock.json on the base branch is not a valid lock file',
  );
});
