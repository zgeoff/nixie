import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import invariant from 'tiny-invariant';
import { mockViewStore } from '../mocks/mock-view-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

async function setupTest() {
  await createDeviceSession();

  return { user: userEvent.setup() };
}

test('it lists the notes newest first with their tags, update time and backlink count', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      {
        at: new Date('2026-11-20T08:00:00Z'),
        title: 'Boiler notes',
        body: 'It trips.',
        tags: ['home'],
      },
    ],
  });

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    versions: [{ at: new Date('2026-11-21T08:00:00Z'), title: 'Zine diary', body: 'Layout.' }],
    links: [{ kind: 'note', target: 'n4w8k2c6rd', type: 'related', reason: 'same week' }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Boiler notes' });

  const rows = rendered.getAllByRole('listitem').map((row) => row.textContent);

  expect(rows).toStrictEqual([
    expect.stringMatching(/^Zine diary.*0 backlinks$/u),
    expect.stringMatching(/^Boiler notes.*Tags: home.*Updated.*1 backlink$/u),
  ]);
});

test('it finds notes by a search word and by a tag', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.', tags: ['home'] }],
  });

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Zine diary', body: 'Layout.', tags: ['craft'] }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Boiler notes' });
  await ctx.user.type(rendered.getByLabelText('Search notes'), 'layout');
  await ctx.user.click(rendered.getByRole('button', { name: 'Search' }));

  await waitFor(() => {
    expect(rendered.queryByRole('link', { name: 'Boiler notes' })).toBeNull();
  });

  expect(rendered.getByRole('link', { name: 'Zine diary' })).toBeVisible();
  expect(rendered.getByText(/words only/u)).toBeVisible();

  await ctx.user.clear(rendered.getByLabelText('Search notes'));
  await ctx.user.type(rendered.getByLabelText('Tags'), 'home');
  await ctx.user.click(rendered.getByRole('button', { name: 'Search' }));
  await rendered.findByRole('link', { name: 'Boiler notes' });

  expect(rendered.queryByRole('link', { name: 'Zine diary' })).toBeNull();
});

test('it loads the next 20 notes with Load more', async () => {
  const ctx = await setupTest();

  for (let index = 1; index <= 21; index += 1) {
    await mockViewStore.notes.create({
      versions: [{ at: new Date(), title: `Note ${index}`, body: 'text' }],
    });
  }

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Note 21' });

  expect(rendered.getAllByRole('listitem')).toHaveLength(20);

  await ctx.user.click(rendered.getByRole('button', { name: 'Load more' }));
  await rendered.findByRole('link', { name: 'Note 1' });

  expect(rendered.getAllByRole('listitem')).toHaveLength(21);
  expect(rendered.queryByRole('button', { name: 'Load more' })).toBeNull();
});

test('it hides a private note and every link to it until Show private is on', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
    links: [{ kind: 'note', target: 'd8p3q1z6mw', type: 'cites', reason: 'a diary entry' }],
  });

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Boiler notes' });

  expect(rendered.queryByText(/Secret diary/u)).toBeNull();
  expect(rendered.queryByText(/Private/u)).toBeNull();
  expect(rendered.getByRole('checkbox', { name: 'Show private' })).not.toBeChecked();

  await ctx.user.click(rendered.getByRole('link', { name: 'Boiler notes' }));
  await rendered.findByRole('heading', { name: 'Boiler notes' });

  expect(rendered.getByText('This note links to nothing.')).toBeVisible();
  expect(rendered.queryByText(/Secret diary|a diary entry|Gone/u)).toBeNull();
});

test('it shows a private note beside the others and keeps Show private in the address', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
  });

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook?private=1');

  await rendered.findByRole('link', { name: 'Secret diary' });

  expect(rendered.getByRole('checkbox', { name: 'Show private' })).toBeChecked();
  expect(rendered.getByRole('link', { name: 'Boiler notes' })).toBeVisible();
  expect(mockViewStore.noteOpens.all()).toStrictEqual([]);
});

test('it writes nothing when Show private is turned on', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByText(/No notes yet/u);
  await ctx.user.click(rendered.getByRole('checkbox', { name: 'Show private' }));
  await rendered.findByRole('link', { name: 'Secret diary' });

  expect(mockViewStore.noteOpens.all()).toStrictEqual([]);
  expect(mockViewStore.notes.all().map((note) => note.ownerOpenedAt)).toStrictEqual([null]);
});

test('it shows the title, links, backlinks and history of a note and each target by its title', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      { at: new Date('2026-11-20T08:00:00Z'), title: 'Boiler notes', body: 'It trips.' },
      { at: new Date('2026-11-21T08:00:00Z'), title: 'Boiler notes', body: 'It trips at night.' },
    ],
    links: [
      { kind: 'note', target: 'h2m9t4x7qa', type: 'supersedes', reason: 'a rewrite' },
      { kind: 'note', target: 'k1v6c3m8xe', type: 'cites', reason: null },
    ],
  });

  await mockViewStore.notes.create({
    note: 'h2m9t4x7qa',
    versions: [{ at: new Date(), title: 'Boiler notes (old)', body: 'Old.' }],
  });

  await mockViewStore.notes.create({
    note: 'p7r5t3v1xz',
    versions: [{ at: new Date(), title: 'Winter plan', body: 'Plan.' }],
    links: [{ kind: 'note', target: 'n4w8k2c6rd', type: 'part-of', reason: null }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByRole('heading', { name: 'Boiler notes' });

  expect(rendered.getByText('Version 2 of 2')).toBeVisible();
  expect(rendered.getByText('It trips at night.')).toBeVisible();
  expect(rendered.getByRole('link', { name: 'Boiler notes (old)' })).toBeVisible();
  expect(rendered.getByText(/a rewrite/u)).toBeVisible();
  expect(rendered.getByText('Gone (note)')).toBeVisible();
  expect(rendered.getByRole('link', { name: 'Winter plan' })).toBeVisible();
  expect(rendered.getByRole('link', { name: 'Version 1' })).toBeVisible();
});

test('it reads an older version through the history', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      { at: new Date('2026-11-20T08:00:00Z'), title: 'Boiler notes', body: 'It trips.' },
      { at: new Date('2026-11-21T08:00:00Z'), title: 'Boiler notes', body: 'It trips at night.' },
    ],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const versionLink = await rendered.findByRole('link', { name: 'Version 1' });

  await ctx.user.click(versionLink);
  await rendered.findByText('Version 1 of 2');

  expect(rendered.getByText('It trips.')).toBeVisible();
  expect(rendered.queryByText('It trips at night.')).toBeNull();
});

test('it shows the stored image of a body and image unavailable for an unknown one', async () => {
  await setupTest();

  await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'harbour' });

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      {
        at: new Date(),
        title: 'Pictures',
        body: '![the harbour](image:k3x9m2p7qa)\n\n![lost](image:zzzzzzzzzz)',
      },
    ],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const picture = await rendered.findByRole('img', { name: 'the harbour' });

  expect(picture.getAttribute('src')).toStartWith('blob:');

  await rendered.findByText('image unavailable');
});

test('it never loads a remote image from a body', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      {
        at: new Date(),
        title: 'Fetched page',
        body: '![tracker](https://tracker.test/pixel.png) and <img src="https://tracker.test/raw.png"> and [![linked](https://tracker.test/in-link.png)](https://example.test/page)',
      },
    ],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByRole('link', { name: 'image: tracker' });

  expect(rendered.queryByRole('img')).toBeNull();
  expect(document.querySelector('img')).toBeNull();

  expect(rendered.getByRole('link', { name: 'image: tracker' })).toHaveAttribute(
    'href',
    'https://tracker.test/pixel.png',
  );
});

test('it folds the body of a private note and opens it with a diff against the version before', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [
      {
        at: new Date('2026-11-20T08:00:00Z'),
        title: 'Secret diary',
        body: 'Dear diary, it rained.',
      },
      {
        at: new Date('2026-11-21T08:00:00Z'),
        title: 'Secret diary',
        body: 'Dear diary, it snowed.',
      },
    ],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  await rendered.findByRole('heading', { name: 'Secret diary' });

  expect(rendered.getByText(/marked this note private/u)).toBeVisible();
  expect(rendered.queryByText(/it snowed/u)).toBeNull();
  expect(rendered.queryByRole('region', { name: 'History' })).toBeNull();

  await ctx.user.click(rendered.getByRole('button', { name: 'Open' }));
  await rendered.findByText('Dear diary, it snowed.');

  expect(rendered.getByText(/^Opened /u)).toBeVisible();
  expect(rendered.getByText('snowed.', { selector: 'ins' })).toBeVisible();
  expect(rendered.getByText('rained.', { selector: 'del' })).toBeVisible();
  expect(rendered.getByRole('region', { name: 'History' })).toBeVisible();
  expect(mockViewStore.noteOpens.all()).toHaveLength(1);
  expect(mockViewStore.noteOpenCalls.clientActionIDs).toHaveLength(1);
});

test('it shows the time you last opened a private note', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    ownerOpenedAt: new Date('2026-11-22T10:00:00Z'),
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  await rendered.findByText(/You last opened it/u);
});

test('it retries an open that failed with the same action ID and moves the mark once', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  mockViewStore.noteOpenCalls.failuresLeft = 1;

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  const openButton = await rendered.findByRole('button', { name: 'Open' });

  await ctx.user.click(openButton);
  await rendered.findByText('The open did not finish. Try again.');
  await ctx.user.click(rendered.getByRole('button', { name: 'Try again' }));
  await rendered.findByText('Dear diary.');

  const [first, second] = mockViewStore.noteOpenCalls.clientActionIDs;

  expect(mockViewStore.noteOpenCalls.clientActionIDs).toHaveLength(2);
  expect(second).toBe(first);
  expect(mockViewStore.noteOpens.all()).toHaveLength(1);
});

test('it shows only that a private note is private with Show private off', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw');

  await rendered.findByRole('heading', { name: 'This note is private' });

  expect(rendered.queryByText(/Secret diary|Dear diary/u)).toBeNull();

  await ctx.user.click(rendered.getByRole('button', { name: 'Show private' }));
  await rendered.findByRole('heading', { name: 'Secret diary' });

  expect(rendered.getByRole('button', { name: 'Open' })).toBeVisible();
});

test('it lists orphans, dangling links and repeated reasons, each linking to its note', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Lonely note', body: 'Alone.' }],
  });

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    versions: [{ at: new Date(), title: 'Pointing note', body: 'Points.' }],
    links: [{ kind: 'note', target: 'k1v6c3m8xe', type: 'cites', reason: null }],
  });

  const rendered = renderRoute('/notebook/check');

  await rendered.findByRole('heading', { name: 'Orphans (1)' });

  expect(rendered.getByRole('heading', { name: 'Dangling links (1)' })).toBeVisible();
  expect(rendered.getByText(/cites note k1v6c3m8xe, which is gone/u)).toBeVisible();
  expect(rendered.getByRole('heading', { name: 'Repeated reasons (0)' })).toBeVisible();

  await ctx.user.click(rendered.getByRole('link', { name: 'Lonely note' }));
  await rendered.findByRole('heading', { name: 'Lonely note' });
});

test('it leaves a private orphan out of the check until Show private is on', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const hidden = renderRoute('/notebook/check');

  await hidden.findByRole('heading', { name: 'Orphans (0)' });

  expect(hidden.queryByText('Secret diary')).toBeNull();
});

test('it shows a private orphan in the check with Show private on', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/check?private=1');

  await rendered.findByRole('link', { name: 'Secret diary' });
});

test('it previews a forget, forgets the note with the version shown and shows the backup state', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      { at: new Date(), title: 'Boiler notes', body: 'It trips.' },
      { at: new Date(), title: 'Boiler notes', body: 'It trips at night.' },
    ],
    links: [{ kind: 'note', target: 'h2m9t4x7qa', type: 'cites', reason: null }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);
  await rendered.findByText(/Forget "Boiler notes" for good\?/u);

  expect(rendered.getByText(/2 versions and its 1 link/u)).toBeVisible();

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/Key backups: pending/u);

  expect(rendered.getByText('The note is forgotten.')).toBeVisible();
  expect(rendered.queryByText('It trips at night.')).toBeNull();
  expect(mockViewStore.notes.all().map((note) => note.isForgotten)).toStrictEqual([true]);
});

test('it forgets a private note without opening it', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);

  const forgetForGoodButton = await rendered.findByRole('button', { name: 'Forget for good' });

  await ctx.user.click(forgetForGoodButton);
  await rendered.findByText(/Key backups: pending/u);

  expect(mockViewStore.noteOpens.all()).toStrictEqual([]);
  expect(mockViewStore.notes.all().map((note) => note.isForgotten)).toStrictEqual([true]);
});

test('it asks to reload when the note moved past the version the preview read', async () => {
  const ctx = await setupTest();

  const note = await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);
  await rendered.findByRole('button', { name: 'Forget for good' });

  await mockViewStore.notes.update(note, {
    data(draft) {
      draft.versions.push({
        at: new Date(),
        title: 'Boiler notes',
        body: 'It trips at night.',
        model: 'claude-model',
        tags: [],
        writer: 'conversation',
      });
    },
  });

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/The note changed since this preview\. Reload the page/u);

  expect(mockViewStore.notes.all().map((row) => row.isForgotten)).toStrictEqual([false]);
});

test('it leaves no title or body of a forgotten note in any cached list or note view', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'A secret boiler body.' }],
  });

  const rendered = renderRoute('/notebook');

  const boilerNotesLink = await rendered.findByRole('link', { name: 'Boiler notes' });

  await ctx.user.click(boilerNotesLink);
  await rendered.findByText('A secret boiler body.');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);

  const forgetForGoodButton = await rendered.findByRole('button', { name: 'Forget for good' });

  await ctx.user.click(forgetForGoodButton);
  await rendered.findByText(/Key backups: pending/u);

  await waitFor(() => {
    const cached = rendered.queryClient
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.state.data ?? null))
      .join(' ');

    expect(cached).not.toMatch(/Boiler notes|A secret boiler body/u);
  });

  await ctx.user.click(rendered.getByRole('link', { name: 'All notes' }));
  await rendered.findByText(/No notes yet/u);
});

test('it shows the body of a private note only after its own Open, whatever note was opened before', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Winter diary', body: 'Dear diary, it snowed.' }],
    links: [{ kind: 'note', target: 'k1v6c3m8xe', type: 'related', reason: null }],
  });

  await mockViewStore.notes.create({
    note: 'k1v6c3m8xe',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Spring diary', body: 'Dear diary, it bloomed.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  const openButton = await rendered.findByRole('button', { name: 'Open' });

  await ctx.user.click(openButton);
  await rendered.findByText('Dear diary, it snowed.');
  await ctx.user.click(rendered.getByRole('link', { name: 'Spring diary' }));
  await rendered.findByRole('heading', { name: 'Spring diary' });

  expect(rendered.queryByText('Dear diary, it snowed.')).toBeNull();
  expect(rendered.queryByText('Dear diary, it bloomed.')).toBeNull();
  expect(rendered.getByRole('button', { name: 'Open' })).toBeVisible();
});

test('it shows a note, not the forgotten state, after another note was forgotten', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date('2026-11-21T08:00:00Z'), title: 'Boiler notes', body: 'It trips.' }],
    links: [{ kind: 'note', target: 'p7r5t3v1xz', type: 'cites', reason: null }],
  });

  await mockViewStore.notes.create({
    note: 'p7r5t3v1xz',
    versions: [{ at: new Date('2026-11-20T08:00:00Z'), title: 'Winter plan', body: 'Plan.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const winterPlanLink = await rendered.findByRole('link', { name: 'Winter plan' });

  await ctx.user.click(winterPlanLink);

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);

  const forgetForGoodButton = await rendered.findByRole('button', { name: 'Forget for good' });

  await ctx.user.click(forgetForGoodButton);
  await rendered.findByText('The note is forgotten.');
  await ctx.user.click(rendered.getByRole('link', { name: 'All notes' }));

  const boilerNotesLink = await rendered.findByRole('link', { name: 'Boiler notes' });

  await ctx.user.click(boilerNotesLink);
  await rendered.findByRole('heading', { name: 'Boiler notes' });

  expect(rendered.queryByText('The note is forgotten.')).toBeNull();
  expect(rendered.getByText('Gone (note)')).toBeVisible();
});

test('it drops a note that a later read finds forgotten from the screen', async () => {
  await setupTest();

  const note = await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'A secret boiler body.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByText('A secret boiler body.');

  await mockViewStore.notes.update(note, {
    data(draft) {
      draft.isForgotten = true;
      draft.versions = [];
    },
  });

  await rendered.queryClient.invalidateQueries();
  await rendered.findByRole('alert');

  expect(rendered.queryByText('A secret boiler body.')).toBeNull();
  expect(rendered.queryByRole('heading', { name: 'Boiler notes' })).toBeNull();
});

test('it previews the forget of a hidden private note without its title or counts', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
    links: [{ kind: 'note', target: 'k1v6c3m8xe', type: 'cites', reason: null }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);
  await rendered.findByText(/Forget this private note for good\?/u);

  expect(rendered.queryByText(/Secret diary|\d+ versions?|\d+ links?/u)).toBeNull();

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/Key backups: pending/u);

  expect(mockViewStore.notes.all().map((note) => note.isForgotten)).toStrictEqual([true]);
});

test('it leaves the body snippet of a private note out of the search results', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'The spare key hides in the shed.' }],
  });

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [
      { at: new Date(), title: 'Secret diary', body: 'The spare key hides under the mat.' },
    ],
  });

  const rendered = renderRoute('/notebook?private=1');

  await rendered.findByRole('link', { name: 'Secret diary' });
  await ctx.user.type(rendered.getByLabelText('Search notes'), 'spare');
  await ctx.user.click(rendered.getByRole('button', { name: 'Search' }));
  await rendered.findByText(/hides in the shed/u);

  expect(rendered.getByRole('link', { name: 'Secret diary' })).toBeVisible();
  expect(rendered.queryByText(/under the mat/u)).toBeNull();
});

test('it asks to reload when the note gained a version after the page loaded', async () => {
  const ctx = await setupTest();

  const note = await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByText('It trips.');

  await mockViewStore.notes.update(note, {
    data(draft) {
      draft.versions.push({
        at: new Date(),
        title: 'Boiler notes',
        body: 'It trips at night.',
        model: 'claude-model',
        tags: [],
        writer: 'conversation',
      });
    },
  });

  await ctx.user.click(rendered.getByRole('button', { name: 'Forget' }));
  await rendered.findByText(/The note changed since this page loaded/u);

  expect(rendered.queryByRole('button', { name: 'Forget for good' })).toBeNull();
  expect(mockViewStore.notes.all().map((row) => row.isForgotten)).toStrictEqual([false]);
});

test('it reads the note again for a forget opened after a Keep and an edit', async () => {
  const ctx = await setupTest();

  const note = await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const forgetButton = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButton);
  await rendered.findByRole('button', { name: 'Forget for good' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Keep' }));

  await mockViewStore.notes.update(note, {
    data(draft) {
      draft.versions.push({
        at: new Date(),
        title: 'Boiler notes',
        body: 'It trips at night.',
        model: 'claude-model',
        tags: [],
        writer: 'conversation',
      });
    },
  });

  const forgetButtonAgain = await rendered.findByRole('button', { name: 'Forget' });

  await ctx.user.click(forgetButtonAgain);
  await rendered.findByText(/The note changed since this page loaded/u);

  expect(rendered.queryByRole('button', { name: 'Forget for good' })).toBeNull();
});

test('it shows image unavailable for a stored image forgotten since the last visit', async () => {
  const ctx = await setupTest();
  const image = await mockViewStore.images.create({ image: 'k3x9m2p7qa', name: 'harbour' });

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Pictures', body: '![the harbour](image:k3x9m2p7qa)' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByRole('img', { name: 'the harbour' });
  await ctx.user.click(rendered.getByRole('link', { name: 'All notes' }));
  await rendered.findByRole('link', { name: 'Pictures' });

  await mockViewStore.images.update(image, {
    data(draft) {
      draft.isForgotten = true;
    },
  });

  await ctx.user.click(rendered.getByRole('link', { name: 'Pictures' }));
  await rendered.findByText('image unavailable');

  expect(rendered.queryByRole('img')).toBeNull();
});

test('it reports a related reason that more than 3 links repeat, ignoring case and spacing', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
    links: [
      { kind: 'note', target: 'a1a1a1a1a1', type: 'related', reason: 'Same week' },
      { kind: 'note', target: 'b2b2b2b2b2', type: 'related', reason: '  same   WEEK ' },
      { kind: 'note', target: 'c3c3c3c3c3', type: 'related', reason: 'SAME week' },
      { kind: 'note', target: 'd4d4d4d4d4', type: 'related', reason: 'same week ' },
    ],
  });

  for (const note of ['a1a1a1a1a1', 'b2b2b2b2b2', 'c3c3c3c3c3', 'd4d4d4d4d4']) {
    await mockViewStore.notes.create({
      note,
      versions: [{ at: new Date(), title: `Note ${note}`, body: 'Text.' }],
    });
  }

  const rendered = renderRoute('/notebook/check');

  await rendered.findByRole('heading', { name: 'Repeated reasons (1)' });

  const section = rendered.getByRole('region', { name: 'Repeated reasons' });

  expect(within(section).getByText(/"Same week" on 4 links/u)).toBeVisible();

  const [firstLink] = within(section).getAllByRole('link', { name: 'n4w8k2c6rd' });

  invariant(firstLink);

  await ctx.user.click(firstLink);
  await rendered.findByRole('heading', { name: 'Boiler notes' });
});

test('it leaves a reason held by only 3 links out of the check', async () => {
  await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
    links: [
      { kind: 'note', target: 'a1a1a1a1a1', type: 'related', reason: 'Same week' },
      { kind: 'note', target: 'b2b2b2b2b2', type: 'related', reason: 'same week' },
      { kind: 'note', target: 'c3c3c3c3c3', type: 'related', reason: 'SAME WEEK' },
    ],
  });

  const rendered = renderRoute('/notebook/check');

  await rendered.findByRole('heading', { name: 'Repeated reasons (0)' });
});

test('it pages the history of a note with 51 versions', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: Array.from({ length: 51 }, (_, index) => ({
      at: new Date(2026, 10, 1, 8, index),
      title: 'Boiler notes',
      body: `Draft ${index + 1}`,
    })),
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  await rendered.findByText('Version 51 of 51');

  const history = rendered.getByRole('region', { name: 'History' });

  expect(within(history).getAllByRole('link')).toHaveLength(50);
  expect(within(history).queryByRole('link', { name: 'Version 1' })).toBeNull();

  await ctx.user.click(within(history).getByRole('button', { name: 'Load older versions' }));

  await within(history).findByRole('link', { name: 'Version 1' });

  expect(within(history).getAllByRole('link')).toHaveLength(51);
  expect(within(history).queryByRole('button', { name: 'Load older versions' })).toBeNull();
});
