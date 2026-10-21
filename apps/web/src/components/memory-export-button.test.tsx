import { expect, onTestFinished, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/node';
import { store } from '../mocks/store';
import { buildStubSaveFilePicker } from '../test-utils/build-stub-save-file-picker';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MemoryView } from './memory-view';

// happy-dom follows a clicked download link as a page load, so the test records each click instead.
async function setupTest() {
  const user = userEvent.setup();
  const picker = buildStubSaveFilePicker();

  Object.assign(globalThis, { showSaveFilePicker: picker.showSaveFilePicker });

  onTestFinished(() => {
    Reflect.deleteProperty(globalThis, 'showSaveFilePicker');
  });

  const downloads: { name: string; href: string }[] = [];

  const onDocumentClick = (event: MouseEvent): void => {
    if (event.target instanceof HTMLAnchorElement && event.target.download !== '') {
      event.preventDefault();
      downloads.push({ name: event.target.download, href: event.target.href });
    }
  };

  document.addEventListener('click', onDocumentClick, { capture: true });

  onTestFinished(() => {
    document.removeEventListener('click', onDocumentClick, { capture: true });
  });

  await createDeviceSession();

  return { user, picker, downloads };
}

test('it saves every item to the file the user picks, with a forgotten item as only its ID and time', async () => {
  const ctx = await setupTest();

  const active = await store.memoryItems.create({
    versions: [{ text: 'Rents allotment plot 14' }],
  });

  const forgotten = await store.memoryItems.create({
    forgottenAt: new Date('2026-10-13T18:31:00.000Z'),
    state: 'forgotten',
    versions: [{ text: 'Keeps a spare key under the blue pot' }],
  });

  const rendered = render(<MemoryView />);
  const section = rendered.getByRole('region', { name: 'Export' });

  await ctx.user.click(within(section).getByRole('button', { name: 'Export memory' }));

  await within(section).findByText('Saved the export.');

  const files = ctx.picker.readFiles();

  expect(files).toStrictEqual([
    {
      name: expect.toSatisfy((name: string) =>
        /^nixie-memory-\d{4}-\d{2}-\d{2}\.json$/u.test(name),
      ),
      text: expect.toBeString(),
      ending: 'closed',
    },
  ]);

  expect(JSON.parse(files[0]?.text ?? 'null')).toMatchObject({
    header: { schemaVersion: 3, snapshotHash: 'sha256:mock' },
    items: [
      { itemID: active.itemID, versions: [{ text: 'Rents allotment plot 14' }] },
      { itemID: forgotten.itemID, forgottenAt: '2026-10-13T18:31:00.000Z' },
    ],
  });
});

test('it exports nothing when the user closes the save picker', async () => {
  const ctx = await setupTest();

  Object.assign(globalThis, {
    showSaveFilePicker: () =>
      Promise.reject(new DOMException('The user aborted a request.', 'AbortError')),
  });

  const rendered = render(<MemoryView />);
  const section = rendered.getByRole('region', { name: 'Export' });
  const button = within(section).getByRole('button', { name: 'Export memory' });

  await ctx.user.click(button);

  await waitFor(() => {
    expect(button).toBeEnabled();
  });

  expect(store.memoryActions.all()).toStrictEqual([]);
  expect(within(section).queryByRole('alert')).toBeNull();
});

test('it downloads the file in a browser with no save picker', async () => {
  const ctx = await setupTest();

  Reflect.deleteProperty(globalThis, 'showSaveFilePicker');

  const rendered = render(<MemoryView />);
  const section = rendered.getByRole('region', { name: 'Export' });

  await ctx.user.click(within(section).getByRole('button', { name: 'Export memory' }));

  await within(section).findByText('Saved the export.');

  expect(ctx.downloads).toStrictEqual([
    {
      name: expect.toSatisfy((name: string) =>
        /^nixie-memory-\d{4}-\d{2}-\d{2}\.json$/u.test(name),
      ),
      href: expect.toStartWith('blob:'),
    },
  ]);
});

test('it tells the user an export that did not finish, and tries again as the same action', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/memory/export', () => HttpResponse.error(), { once: true }));

  const rendered = render(<MemoryView />);
  const section = rendered.getByRole('region', { name: 'Export' });

  await ctx.user.click(within(section).getByRole('button', { name: 'Export memory' }));

  await within(section).findByRole('alert');

  await ctx.user.click(within(section).getByRole('button', { name: 'Export memory' }));

  await within(section).findByText('Saved the export.');

  expect(ctx.picker.readFiles().map((file) => file.ending)).toStrictEqual(['aborted', 'closed']);
  expect(store.memoryActions.all()).toHaveLength(1);
});

test('it aborts the file and tells the user when the stream ends before the export completes', async () => {
  const ctx = await setupTest();

  const header =
    '{"header":{"schemaVersion":2,"exportedAt":"2026-10-14T08:00:00.000Z","snapshotHash":"sha256:mock"},"items":[';

  server.use(
    http.post(
      '*/rpc/memory/export',
      () =>
        new HttpResponse(
          `event: message\ndata: ${JSON.stringify({ json: { chunk: header } })}\n\n`,
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        ),
      { once: true },
    ),
  );

  const rendered = render(<MemoryView />);
  const section = rendered.getByRole('region', { name: 'Export' });

  await ctx.user.click(within(section).getByRole('button', { name: 'Export memory' }));

  await within(section).findByRole('alert');

  expect(ctx.picker.readFiles()).toStrictEqual([
    { name: expect.toBeString(), text: header, ending: 'aborted' },
  ]);

  expect(within(section).queryByText('Saved the export.')).toBeNull();
});
