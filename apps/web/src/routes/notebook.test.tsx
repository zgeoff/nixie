import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockViewStore } from '../mocks/mock-view-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { renderRoute } from '../test-utils/render-route';

test('it lists the notes newest first with their tags, update time and backlink count', async () => {
  await createDeviceSession();

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
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.', tags: ['home'] }],
  });

  await mockViewStore.notes.create({
    versions: [{ at: new Date(), title: 'Zine diary', body: 'Layout.', tags: ['craft'] }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Boiler notes' });
  await user.type(rendered.getByLabelText('Search notes'), 'layout');
  await user.click(rendered.getByRole('button', { name: 'Search' }));

  await waitFor(() => {
    expect(rendered.queryByRole('link', { name: 'Boiler notes' })).toBeNull();
  });

  expect(rendered.getByRole('link', { name: 'Zine diary' })).toBeVisible();
  expect(rendered.getByText(/words only/u)).toBeVisible();

  await user.clear(rendered.getByLabelText('Search notes'));
  await user.type(rendered.getByLabelText('Tags'), 'home');
  await user.click(rendered.getByRole('button', { name: 'Search' }));
  await rendered.findByRole('link', { name: 'Boiler notes' });

  expect(rendered.queryByRole('link', { name: 'Zine diary' })).toBeNull();
});

test('it loads the next 20 notes with Load more', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  for (let index = 1; index <= 21; index += 1) {
    await mockViewStore.notes.create({
      versions: [{ at: new Date(), title: `Note ${index}`, body: 'text' }],
    });
  }

  const rendered = renderRoute('/notebook');

  await rendered.findByRole('link', { name: 'Note 21' });

  expect(rendered.getAllByRole('listitem')).toHaveLength(20);

  await user.click(rendered.getByRole('button', { name: 'Load more' }));
  await rendered.findByRole('link', { name: 'Note 1' });

  expect(rendered.getAllByRole('listitem')).toHaveLength(21);
  expect(rendered.queryByRole('button', { name: 'Load more' })).toBeNull();
});

test('it hides a private note and every link to it until Show private is on', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

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

  await user.click(rendered.getByRole('link', { name: 'Boiler notes' }));
  await rendered.findByRole('heading', { name: 'Boiler notes' });

  expect(rendered.getByText('This note links to nothing.')).toBeVisible();
  expect(rendered.queryByText(/Secret diary|a diary entry|Gone/u)).toBeNull();
});

test('it shows a private note beside the others and keeps Show private in the address', async () => {
  await createDeviceSession();

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
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook');

  await rendered.findByText(/No notes yet/u);
  await user.click(rendered.getByRole('checkbox', { name: 'Show private' }));
  await rendered.findByRole('link', { name: 'Secret diary' });

  expect(mockViewStore.noteOpens.all()).toStrictEqual([]);
  expect(mockViewStore.notes.all().map((note) => note.ownerOpenedAt)).toStrictEqual([null]);
});

test('it shows the title, links, backlinks and history of a note and each target by its title', async () => {
  await createDeviceSession();

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
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [
      { at: new Date('2026-11-20T08:00:00Z'), title: 'Boiler notes', body: 'It trips.' },
      { at: new Date('2026-11-21T08:00:00Z'), title: 'Boiler notes', body: 'It trips at night.' },
    ],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const versionLink = await rendered.findByRole('link', { name: 'Version 1' });

  await user.click(versionLink);
  await rendered.findByText('Version 1 of 2');

  expect(rendered.getByText('It trips.')).toBeVisible();
  expect(rendered.queryByText('It trips at night.')).toBeNull();
});

test('it shows the stored image of a body and image unavailable for an unknown one', async () => {
  await createDeviceSession();

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
  await createDeviceSession();

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
  const user = userEvent.setup();

  await createDeviceSession();

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

  await user.click(rendered.getByRole('button', { name: 'Open' }));
  await rendered.findByText('Dear diary, it snowed.');

  expect(rendered.getByText(/^Opened /u)).toBeVisible();
  expect(rendered.getByText('snowed.', { selector: 'ins' })).toBeVisible();
  expect(rendered.getByText('rained.', { selector: 'del' })).toBeVisible();
  expect(rendered.getByRole('region', { name: 'History' })).toBeVisible();
  expect(mockViewStore.noteOpens.all()).toHaveLength(1);
  expect(mockViewStore.noteOpenCalls.clientActionIDs).toHaveLength(1);
});

test('it shows the time you last opened a private note', async () => {
  await createDeviceSession();

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
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  mockViewStore.noteOpenCalls.failuresLeft = 1;

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  const openButton = await rendered.findByRole('button', { name: 'Open' });

  await user.click(openButton);
  await rendered.findByText('The open did not finish. Try again.');
  await user.click(rendered.getByRole('button', { name: 'Try again' }));
  await rendered.findByText('Dear diary.');

  const [first, second] = mockViewStore.noteOpenCalls.clientActionIDs;

  expect(mockViewStore.noteOpenCalls.clientActionIDs).toHaveLength(2);
  expect(second).toBe(first);
  expect(mockViewStore.noteOpens.all()).toHaveLength(1);
});

test('it shows only that a private note is private with Show private off', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw');

  await rendered.findByRole('heading', { name: 'This note is private' });

  expect(rendered.queryByText(/Secret diary|Dear diary/u)).toBeNull();

  await user.click(rendered.getByRole('button', { name: 'Show private' }));
  await rendered.findByRole('heading', { name: 'Secret diary' });

  expect(rendered.getByRole('button', { name: 'Open' })).toBeVisible();
});

test('it lists orphans, dangling links and repeated reasons, each linking to its note', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

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

  await user.click(rendered.getByRole('link', { name: 'Lonely note' }));
  await rendered.findByRole('heading', { name: 'Lonely note' });
});

test('it leaves a private orphan out of the check until Show private is on', async () => {
  await createDeviceSession();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const hidden = renderRoute('/notebook/check');

  await hidden.findByRole('heading', { name: 'Orphans (0)' });

  expect(hidden.queryByText('Secret diary')).toBeNull();
});

test('it shows a private orphan in the check with Show private on', async () => {
  await createDeviceSession();

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/check?private=1');

  await rendered.findByRole('link', { name: 'Secret diary' });
});

test('it previews a forget, forgets the note with the version shown and shows the backup state', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

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

  await user.click(forgetButton);
  await rendered.findByText(/Forget "Boiler notes" for good\?/u);

  expect(rendered.getByText(/2 versions and its 1 link/u)).toBeVisible();

  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/Key backups: pending/u);

  expect(rendered.getByText('The note is forgotten.')).toBeVisible();
  expect(rendered.queryByText('It trips at night.')).toBeNull();
  expect(mockViewStore.notes.all().map((note) => note.isForgotten)).toStrictEqual([true]);
});

test('it forgets a private note without opening it', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Secret diary', body: 'Dear diary.' }],
  });

  const rendered = renderRoute('/notebook/d8p3q1z6mw?private=1');

  const forgetButton2 = await rendered.findByRole('button', { name: 'Forget' });

  await user.click(forgetButton2);

  const forgetForGoodButton = await rendered.findByRole('button', { name: 'Forget for good' });

  await user.click(forgetForGoodButton);
  await rendered.findByText(/Key backups: pending/u);

  expect(mockViewStore.noteOpens.all()).toStrictEqual([]);
  expect(mockViewStore.notes.all().map((note) => note.isForgotten)).toStrictEqual([true]);
});

test('it asks to reload when the note moved past the version the preview read', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  const note = await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'It trips.' }],
  });

  const rendered = renderRoute('/notebook/n4w8k2c6rd');

  const forgetButton3 = await rendered.findByRole('button', { name: 'Forget' });

  await user.click(forgetButton3);
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

  await user.click(rendered.getByRole('button', { name: 'Forget for good' }));
  await rendered.findByText(/The note changed since this preview\. Reload the page/u);

  expect(mockViewStore.notes.all().map((row) => row.isForgotten)).toStrictEqual([false]);
});

test('it leaves no title or body of a forgotten note in any cached list or note view', async () => {
  const user = userEvent.setup();

  await createDeviceSession();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Boiler notes', body: 'A secret boiler body.' }],
  });

  const rendered = renderRoute('/notebook');

  const boilerNotesLink = await rendered.findByRole('link', { name: 'Boiler notes' });

  await user.click(boilerNotesLink);
  await rendered.findByText('A secret boiler body.');

  const forgetButton4 = await rendered.findByRole('button', { name: 'Forget' });

  await user.click(forgetButton4);

  const forgetForGoodButton2 = await rendered.findByRole('button', { name: 'Forget for good' });

  await user.click(forgetForGoodButton2);
  await rendered.findByText(/Key backups: pending/u);

  await waitFor(() => {
    const cached = rendered.queryClient
      .getQueryCache()
      .getAll()
      .map((query) => JSON.stringify(query.state.data ?? null))
      .join(' ');

    expect(cached).not.toMatch(/Boiler notes|A secret boiler body/u);
  });

  await user.click(rendered.getByRole('link', { name: 'All notes' }));
  await rendered.findByText(/No notes yet/u);
});
