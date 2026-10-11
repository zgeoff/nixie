import { expect, test } from 'bun:test';
import { renderMigrationNotes } from './render-migration-notes';

test('it lists each added migration and whether the last release reads its schema', () => {
  expect(
    renderMigrationNotes(
      {
        changed: [],
        changedObjects: [],
        added: [
          { version: 7, name: 'add the moments table', refused: [] },
          { version: 8, name: 'add a title to moments', refused: [] },
        ],
        readableByReleaseBefore: true,
      },
      'v0.3.0',
      '<!-- marker -->',
    ),
  ).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Migrations

    The migrations this release adds since v0.3.0, and whether v0.3.0 can read the schema each leaves.

    | Version | Migration | Readable by v0.3.0 |
    | ------- | --------- | ---------------------- |
    | 7 | add the moments table | yes |
    | 8 | add a title to moments | yes |
    "
  `);
});

test('it marks the schema unreadable by the last release when the build declares the break', () => {
  expect(
    renderMigrationNotes(
      {
        changed: [],
        changedObjects: [],
        added: [{ version: 7, name: 'drop the legacy column', refused: [] }],
        readableByReleaseBefore: false,
      },
      'v0.3.0',
      '<!-- marker -->',
    ),
  ).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Migrations

    The migrations this release adds since v0.3.0, and whether v0.3.0 can read the schema each leaves.

    | Version | Migration | Readable by v0.3.0 |
    | ------- | --------- | ---------------------- |
    | 7 | drop the legacy column | no |
    "
  `);
});

test('it says the release adds no migration when the schema is unchanged', () => {
  expect(
    renderMigrationNotes(
      { changed: [], changedObjects: [], added: [], readableByReleaseBefore: true },
      'v0.3.0',
      '<!-- marker -->',
    ),
  ).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Migrations

    This release adds no migration since v0.3.0.
    "
  `);
});

test('it lists every migration without a readability column for the first release', () => {
  expect(
    renderMigrationNotes(
      {
        changed: [],
        changedObjects: [],
        added: [{ version: 1, name: 'create the event log', refused: [] }],
        readableByReleaseBefore: true,
      },
      null,
      '<!-- marker -->',
    ),
  ).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Migrations

    The first release creates the schema with these migrations.

    | Version | Migration |
    | ------- | --------- |
    | 1 | create the event log |
    "
  `);
});
