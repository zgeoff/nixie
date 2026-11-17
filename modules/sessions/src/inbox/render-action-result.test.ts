import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderActionResult } from './render-action-result';

test("it fences the result's text in an element that names its source", () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    contentSource: 'untrusted',
    erasable: { status: 'readable', fields: { result: { answer: 'Ten.' } } },
  });

  const block = renderActionResult(record, null, () => 'fence1');

  expect(block).toStrictEqual({
    text: [
      '<tool-result source="untrusted" fence="fence1">',
      '{"answer":"Ten."}',
      '</tool-result fence="fence1">',
    ].join('\n'),
    images: [],
  });
});

test('it shows the message of an error result as it is', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    contentSource: 'untrusted',
    erasable: { status: 'readable', fields: { message: 'the export is not here' } },
  });

  const block = renderActionResult(record, null, () => 'fence1');

  expect(block.text).toContain('\nthe export is not here\n');
});

test('it never shows what the tool recorded for the server alone', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    contentSource: 'owner_data',
    erasable: {
      status: 'readable',
      fields: { result: { ok: true }, hidden: { token: 'secret-value' } },
    },
  });

  const block = renderActionResult(record, null, () => 'fence1');

  expect(block.text).not.toContain('secret-value');
});

test('it says a forgotten result is gone', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    erasable: { status: 'shredded' },
  });

  const block = renderActionResult(record, null, () => 'fence1');

  expect(block.text).toContain('[a result since forgotten]');
});

test('it puts a marker for each image in the text and sends the image with its marker', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    erasable: { status: 'readable', fields: { result: { ok: true } } },
  });

  const bytes = new Uint8Array([1, 2, 3]);

  const block = renderActionResult(
    record,
    { result: { ok: true }, images: [{ mediaType: 'image/png', bytes }] },
    () => 'id1',
  );

  expect(block.images).toStrictEqual([
    { marker: '<tool-image id="id1"/>', mediaType: 'image/png', data: bytes.toBase64() },
  ]);

  expect(block.text).toContain('<tool-image id="id1"/>');
});

test('it shows what the call returned when the record keeps less, such as the IDs of the entries it read', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    contentSource: 'untrusted',
    erasable: { status: 'readable', fields: { result: { entries: ['e1'] } } },
  });

  const block = renderActionResult(
    record,
    { result: { entries: [{ id: 'e1', text: 'The ferry leaves at nine.' }] }, images: [] },
    () => 'fence1',
  );

  expect(block.text).toBe(
    [
      '<tool-result source="untrusted" fence="fence1">',
      '{"entries":[{"id":"e1","text":"The ferry leaves at nine."}]}',
      '</tool-result fence="fence1">',
    ].join('\n'),
  );
});
