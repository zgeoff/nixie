import { expect, test } from 'bun:test';
import { buildStubSaveFilePicker } from './build-stub-save-file-picker';

test('it saves the chunks a page writes to the name it suggests, once the page closes the file', async () => {
  const picker = buildStubSaveFilePicker();

  const handle = await picker.showSaveFilePicker.call(globalThis, { suggestedName: 'notes.json' });
  const writable = await handle.createWritable();

  await writable.write('{"a":');
  await writable.write('1}');
  await writable.close();

  expect(picker.readFiles()).toStrictEqual([
    { name: 'notes.json', text: '{"a":1}', ending: 'closed' },
  ]);
});

test('it marks a file the page aborted', async () => {
  const picker = buildStubSaveFilePicker();

  const handle = await picker.showSaveFilePicker.call(globalThis, { suggestedName: 'notes.json' });
  const writable = await handle.createWritable();

  await writable.write('{"a":');
  await writable.abort();

  expect(picker.readFiles()).toStrictEqual([
    { name: 'notes.json', text: '{"a":', ending: 'aborted' },
  ]);
});

test('it refuses a write after the file ended', async () => {
  const picker = buildStubSaveFilePicker();

  const handle = await picker.showSaveFilePicker.call(globalThis, { suggestedName: 'notes.json' });
  const writable = await handle.createWritable();

  await writable.close();

  expect(writable.write('late')).rejects.toThrow(TypeError);
});

test('it refuses a call with no window as its receiver, as the browser does', () => {
  const showSaveFilePicker = buildStubSaveFilePicker().showSaveFilePicker;

  expect(showSaveFilePicker({ suggestedName: 'notes.json' })).rejects.toThrowWithMessage(
    TypeError,
    'Illegal invocation',
  );
});
