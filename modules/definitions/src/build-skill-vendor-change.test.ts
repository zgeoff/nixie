import { expect, test } from 'bun:test';
import { buildSkillVendorChange } from './build-skill-vendor-change';

test('it adds the skill and its lock entry, and puts the report under the notes', () => {
  expect(
    buildSkillVendorChange({
      version: {
        name: 'tide-tables',
        skillHash: 'b'.repeat(64),
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
        files: new Map([
          ['SKILL.md', '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n'],
          ['scripts/read.py', 'print(1)\n'],
        ]),
      },
      entry: {
        source: 'https://github.com/example/skills',
        path: 'skills/tide-tables',
        commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
      },
      report: '## Review report',
      existing: [],
      lock: `{\n  "harbour-hours": {\n    "source": "https://github.com/example/harbour",\n    "path": "harbour-hours",\n    "commit": "9d2e7b6a4c1f0e8d3b5a7c9e1f2d4b6a8c0e2f4a",\n    "contentHash": "${'c'.repeat(
        64,
      )}"\n  }\n}\n`,
      manifest: 'format: 2\n',
    }),
  ).toMatchInlineSnapshot(`
    {
      "change": {
        "body": 
    "nixie copied the \`tide-tables\` skill from \`skills/tide-tables\` in https://github.com/example/skills at commit \`3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52\`, and pinned it in skills/skills.lock.json with the content hash \`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`. The seed refuses the skill if its files ever differ from that hash.

    Your merge is the review: read the files and the report below before you merge. Nothing in the report lets the skill in.

    ## Review report
    "
    ,
        "branch": "nixie/vendor/tide-tables",
        "files": 
    Map {
          "skills/tide-tables/SKILL.md" => 
    "---
    name: tide-tables
    description: Reads a tide table.
    ---
    "
    ,
          "skills/tide-tables/scripts/read.py" => 
    "print(1)
    "
    ,
          "skills/skills.lock.json" => 
    "{
      "harbour-hours": {
        "source": "https://github.com/example/harbour",
        "path": "harbour-hours",
        "commit": "9d2e7b6a4c1f0e8d3b5a7c9e1f2d4b6a8c0e2f4a",
        "contentHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      },
      "tide-tables": {
        "source": "https://github.com/example/skills",
        "path": "skills/tide-tables",
        "commit": "3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52",
        "contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    }
    "
    ,
        }
    ,
        "message": "Vendor the tide-tables skill from example/skills at 3f6c1a528e0b",
        "title": "Vendor the tide-tables skill from example/skills at 3f6c1a528e0b",
      },
      "status": "ok",
    }
  `);
});

test('it removes the files of the version it replaces and names that version', () => {
  const vendored = buildSkillVendorChange({
    version: {
      name: 'tide-tables',
      skillHash: 'b'.repeat(64),
      frontmatter: {
        name: 'tide-tables',
        description: 'Reads a tide table.',
        license: null,
        compatibility: null,
        allowedTools: null,
        metadata: {},
      },
      files: new Map([['SKILL.md', '# Tides\n']]),
    },
    entry: {
      source: 'https://github.com/example/skills',
      path: 'tide-tables',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    },
    report: '## Review report',
    existing: ['SKILL.md', 'scripts/old.py'],
    lock: JSON.stringify({
      'tide-tables': {
        source: 'https://github.com/example/skills',
        path: 'tide-tables',
        commit: '9d2e7b6a4c1f0e8d3b5a7c9e1f2d4b6a8c0e2f4a',
        contentHash: 'c'.repeat(64),
      },
    }),
    manifest: null,
  });

  expect(vendored).toMatchObject({
    status: 'ok',
    change: {
      title: 'Update the vendored tide-tables skill to example/skills at 3f6c1a528e0b',
      body: expect.toInclude(
        'The change replaces the version pinned at commit `9d2e7b6a4c1f0e8d3b5a7c9e1f2d4b6a8c0e2f4a` in https://github.com/example/skills.',
      ),
      files: new Map([
        ['skills/tide-tables/SKILL.md', '# Tides\n'],
        ['skills/tide-tables/scripts/old.py', null],
        [
          'skills/skills.lock.json',
          '{\n  "tide-tables": {\n    "source": "https://github.com/example/skills",\n    "path": "tide-tables",\n    "commit": "3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52",\n    "contentHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\n  }\n}\n',
        ],
      ]),
    },
  });
});

test('it refuses to replace a skill of the owner that has no lock entry', () => {
  expect(
    buildSkillVendorChange({
      version: {
        name: 'tide-tables',
        skillHash: 'b'.repeat(64),
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
        files: new Map([['SKILL.md', '# Tides\n']]),
      },
      entry: {
        source: 'https://github.com/example/skills',
        path: 'tide-tables',
        commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
      },
      report: '## Review report',
      existing: ['SKILL.md'],
      lock: null,
      manifest: null,
    }),
  ).toStrictEqual({
    status: 'refused',
    reason:
      'skills/tide-tables on the base branch holds a skill of yours with no lock entry, and a vendored skill would replace it; rename or remove that skill first',
  });
});

test('it refuses a base branch whose lock file is not valid', () => {
  expect(
    buildSkillVendorChange({
      version: {
        name: 'tide-tables',
        skillHash: 'b'.repeat(64),
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
        files: new Map([['SKILL.md', '# Tides\n']]),
      },
      entry: {
        source: 'https://github.com/example/skills',
        path: 'tide-tables',
        commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
      },
      report: '## Review report',
      existing: [],
      lock: '{"tide-tables": {"commit": "main"}}',
      manifest: null,
    }),
  ).toStrictEqual({
    status: 'refused',
    reason: 'skills/skills.lock.json on the base branch is not a valid lock file, so fix it first',
  });
});

test('it tells the owner to set the skills format and to list the skill', () => {
  const vendored = buildSkillVendorChange({
    version: {
      name: 'tide-tables',
      skillHash: 'b'.repeat(64),
      frontmatter: {
        name: 'tide-tables',
        description: 'Reads a tide table.',
        license: null,
        compatibility: null,
        allowedTools: null,
        metadata: {},
      },
      files: new Map([['SKILL.md', '# Tides\n']]),
    },
    entry: {
      source: 'https://github.com/example/skills',
      path: 'tide-tables',
      commit: '3f6c1a528e0b4d7a9c215b7e4f0d9a133f6c1a52',
    },
    report: '## Review report',
    existing: [],
    lock: null,
    manifest: 'format: 1\nskills: [harbour-hours]\n',
  });

  expect(vendored).toMatchObject({
    status: 'ok',
    change: {
      body: expect.toInclude(
        "nixie.yaml holds format 1, and the seed applies skills only from format 2, so set `format: 2` in nixie.yaml with the merge to apply the skill.\n\nnixie.yaml lists the conversation's skills. Add `tide-tables` to that list to give the conversation the skill after the merge.",
      ),
    },
  });
});
