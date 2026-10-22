import { expect, test } from 'bun:test';
import { buildSkillExportText } from './build-skill-export-text';

test('it takes the configured templates, the first agent name and the owner name', () => {
  expect(
    buildSkillExportText({
      definitions: {
        source: { kind: 'path', path: '/srv/definitions' },
        probeIntervalMs: 300_000,
        export: {
          repository: 'harbour/definitions',
          base: 'main',
          apiURL: 'https://api.github.com',
          title: 'skills: {operation} {skill}',
          message: '{agent} wrote it for {owner}.\n\n{notes}',
        },
      },
      agent: { names: ['Wren', 'Robin'] },
      owner: { name: 'Morgan', pronouns: { they: 'they', their: 'their' } },
    }),
  ).toStrictEqual({
    title: 'skills: {operation} {skill}',
    message: '{agent} wrote it for {owner}.\n\n{notes}',
    agentName: 'Wren',
    ownerName: 'Morgan',
  });
});

test('it takes no templates and no names when the configuration sets none', () => {
  expect(
    buildSkillExportText({
      definitions: {
        source: { kind: 'path', path: '/srv/definitions' },
        probeIntervalMs: 300_000,
        export: {
          repository: 'harbour/definitions',
          base: 'main',
          apiURL: 'https://api.github.com',
          title: null,
          message: null,
        },
      },
      agent: { names: [] },
      owner: { name: null, pronouns: { they: 'they', their: 'their' } },
    }),
  ).toStrictEqual({ title: null, message: null, agentName: null, ownerName: null });
});
