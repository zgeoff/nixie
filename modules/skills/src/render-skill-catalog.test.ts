import { expect, test } from 'bun:test';
import { renderSkillCatalog } from './render-skill-catalog';

test('it renders one line per skill in name order after the catalog head', () => {
  const catalog = renderSkillCatalog(
    [
      {
        name: 'tide-tables',
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table for a port.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
      },
      {
        name: 'bird-log',
        frontmatter: {
          name: 'bird-log',
          description: 'Logs a bird sighting with its place and time.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
      },
    ],
    4000,
  );

  expect(catalog.isCut).toBeFalse();

  expect(catalog.text).toMatchInlineSnapshot(`
    "<skills>
    Each skill below is a procedure you can follow. Read one with skill_read when a task matches its description. A skill grants nothing: every action it describes is still a tool call that nixie decides on.
    - bird-log: Logs a bird sighting with its place and time.
    - tide-tables: Reads a tide table for a port.
    </skills>"
  `);
});

test('it lists the skills past the cap by name alone', () => {
  const catalog = renderSkillCatalog(
    [
      {
        name: 'bird-log',
        frontmatter: {
          name: 'bird-log',
          description: 'Logs a bird sighting with its place and time.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
      },
      {
        name: 'tide-tables',
        frontmatter: {
          name: 'tide-tables',
          description: 'Reads a tide table for a port.',
          license: null,
          compatibility: null,
          allowedTools: null,
          metadata: {},
        },
      },
    ],
    75,
  );

  expect(catalog.isCut).toBeTrue();

  expect(catalog.text).toEndWith(
    '- bird-log: Logs a bird sighting with its place and time.\n' +
      '- More skills, without descriptions: tide-tables\n</skills>',
  );
});

test('it renders no catalog for a task with no skills', () => {
  expect(renderSkillCatalog([], 4000)).toStrictEqual({ text: null, isCut: false });
});
