import { expect, mock, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { NoteOfferStorageContext } from '../note-offer-storage-context';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ConversationList } from './conversation-list';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it shows a moment the conversation kept, with a link to open it', () => {
  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'moment_kept',
          moment: {
            momentID: '0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
            shortID: 'q4n8v2hw6t',
            title: 'The ladder on the stairs',
          },
        }),
      ]}
    />,
  );

  const notice = rendered.getByRole('listitem', {
    name: 'Kept a moment: The ladder on the stairs',
  });

  expect(rendered.getByRole('link', { name: 'Open' })).toHaveAttribute(
    'href',
    '/moments/0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
  );

  expect(notice).toContainElement(rendered.getByRole('button', { name: 'Add a note' }));
});

test('it saves a note from the keep notice, and offers no note again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({ title: 'The ladder on the stairs', note: null });

  const records = [
    buildMockLogRecord({
      kind: 'moment_kept',
      moment: { momentID: moment.momentID, shortID: moment.shortID, title: moment.title },
    }),
  ];

  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={records}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Add a note' }));

  await ctx.user.type(
    rendered.getByRole('textbox', { name: 'Why this moment matters, in your words' }),
    'Never leave it on the landing.',
  );

  const save = await rendered.findByRole('button', { name: 'Save the note' });

  await ctx.user.click(save);
  await rendered.findByText('Note added.');

  rendered.unmount();

  const again = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={records}
    />,
  );

  const saved = store.moments.findFirst((query) => query.where({ momentID: moment.momentID }));

  expect(saved?.note?.text).toBe('Never leave it on the landing.');
  expect(again.queryByRole('button', { name: 'Add a note' })).toBeNull();
});

test('it opens the note form with the note the moment already holds', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const moment = await store.moments.create({
    title: 'The ladder on the stairs',
    note: { text: 'Never leave it on the landing.', writtenAt: new Date() },
  });

  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={[
        buildMockLogRecord({
          kind: 'moment_kept',
          moment: { momentID: moment.momentID, shortID: moment.shortID, title: moment.title },
        }),
      ]}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Add a note' }));

  const field = await rendered.findByRole('textbox', {
    name: 'Why this moment matters, in your words',
  });

  expect(field).toHaveValue('Never leave it on the landing.');
});

test('it lets the user skip the note, and offers it no more', async () => {
  const ctx = setupTest();

  const records = [
    buildMockLogRecord({
      kind: 'moment_kept',
      moment: {
        momentID: '0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
        shortID: 'q4n8v2hw6t',
        title: 'The ladder on the stairs',
      },
    }),
  ];

  const rendered = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={records}
    />,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Skip' }));

  rendered.unmount();

  const again = render(
    <ConversationList
      entries={[]}
      notices={[]}
      onDiscard={() => {}}
      onRetry={() => Promise.resolve()}
      records={records}
    />,
  );

  expect(
    again.getByRole('listitem', { name: 'Kept a moment: The ladder on the stairs' }),
  ).toBeVisible();

  expect(again.queryByRole('button', { name: 'Add a note' })).toBeNull();
});

test('it keeps the skip in the storage it is given, beside the answers already there', async () => {
  const ctx = setupTest();
  const write = mock<(text: string) => void>();

  const rendered = render(
    <NoteOfferStorageContext
      value={{
        read: () => '["5d2e8a41-7b3c-4f9e-a6d0-1c2b3e4f5a6b"]',
        write,
        subscribe: () => () => {},
      }}
    >
      <ConversationList
        entries={[]}
        notices={[]}
        onDiscard={() => {}}
        onRetry={() => Promise.resolve()}
        records={[
          buildMockLogRecord({
            kind: 'moment_kept',
            moment: {
              momentID: '0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
              shortID: 'q4n8v2hw6t',
              title: 'The ladder on the stairs',
            },
          }),
        ]}
      />
    </NoteOfferStorageContext>,
  );

  await ctx.user.click(rendered.getByRole('button', { name: 'Skip' }));

  expect(write).toHaveBeenCalledExactlyOnceWith(
    '["5d2e8a41-7b3c-4f9e-a6d0-1c2b3e4f5a6b","0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d"]',
  );
});

test('it shows no offer for a moment that the given storage holds as answered', () => {
  const rendered = render(
    <NoteOfferStorageContext
      value={{
        read: () => '["0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d"]',
        write: () => {},
        subscribe: () => () => {},
      }}
    >
      <ConversationList
        entries={[]}
        notices={[]}
        onDiscard={() => {}}
        onRetry={() => Promise.resolve()}
        records={[
          buildMockLogRecord({
            kind: 'moment_kept',
            moment: {
              momentID: '0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
              shortID: 'q4n8v2hw6t',
              title: 'The ladder on the stairs',
            },
          }),
        ]}
      />
    </NoteOfferStorageContext>,
  );

  expect(
    rendered.getByRole('listitem', { name: 'Kept a moment: The ladder on the stairs' }),
  ).toBeVisible();

  expect(rendered.queryByRole('button', { name: 'Add a note' })).toBeNull();
});
