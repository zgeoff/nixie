import { expect, test } from 'bun:test';
import { buildToolForm } from '../test-utils/build-tool-form';
import { buildCallOutcome } from './build-call-outcome';

test('it joins the text blocks by a blank line when the pinned form has no output schema', () => {
  const answer = {
    content: [
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ],
  };

  expect(
    buildCallOutcome('tracker.item_get', buildToolForm({ name: 'item_get' }), answer),
  ).toStrictEqual({
    status: 'ok',
    result: { text: 'one\n\ntwo' },
  });
});

test('it returns image blocks as images and counts every other block in a last line', () => {
  const answer = {
    content: [
      { type: 'text', text: 'one' },
      { type: 'image', data: 'AQID', mimeType: 'image/png' },
      { type: 'audio', data: 'x', mimeType: 'audio/wav' },
      { type: 'resource_link', uri: 'https://example.org' },
    ],
  };

  expect(
    buildCallOutcome('tracker.item_get', buildToolForm({ name: 'item_get' }), answer),
  ).toStrictEqual({
    status: 'ok',
    result: { text: 'one\n\n[2 other blocks were dropped]' },
    images: [{ mediaType: 'image/png', bytes: Buffer.from([1, 2, 3]) }],
  });
});

test('it ignores structured content when the pinned form has no output schema', () => {
  const answer = { content: [{ type: 'text', text: 'one' }], structuredContent: { id: 'x' } };

  expect(
    buildCallOutcome('tracker.item_get', buildToolForm({ name: 'item_get' }), answer),
  ).toStrictEqual({
    status: 'ok',
    result: { text: 'one' },
  });
});

test('it returns the structured content of a tool whose pinned form has an output schema', () => {
  const form = buildToolForm({
    name: 'item_get',
    outputSchema: { type: 'object', properties: { id: { type: 'string' } } },
  });

  const answer = { content: [{ type: 'text', text: '{}' }], structuredContent: { id: 'x' } };

  expect(buildCallOutcome('tracker.item_get', form, answer)).toStrictEqual({
    status: 'ok',
    result: { id: 'x' },
  });
});

test('it returns an error when a tool with an output schema answers with no structured content', () => {
  const form = buildToolForm({
    name: 'item_get',
    outputSchema: { type: 'object', properties: {} },
  });

  expect(
    buildCallOutcome('tracker.item_get', form, { content: [{ type: 'text', text: 'x' }] }),
  ).toStrictEqual({
    status: 'error',
    message: 'tracker.item_get answered with no structured content',
  });
});

test('it keeps the text of a server error, whatever the output schema says', () => {
  const form = buildToolForm({
    name: 'item_get',
    outputSchema: { type: 'object', properties: {} },
  });

  const answer = { content: [{ type: 'text', text: 'no such item' }], isError: true };

  expect(buildCallOutcome('tracker.item_get', form, answer)).toStrictEqual({
    status: 'ok',
    result: { text: 'no such item' },
    isError: true,
  });
});

test('it returns an error for an answer that is no result', () => {
  expect(
    buildCallOutcome('tracker.item_get', buildToolForm({ name: 'item_get' }), 'nope'),
  ).toStrictEqual({
    status: 'error',
    message: 'tracker.item_get answered in a form that nixie cannot read',
  });
});

test('it returns an error when structured content breaks the output schema', () => {
  const form = buildToolForm({
    name: 'item_get',
    outputSchema: {
      type: 'object',
      properties: { count: { type: 'integer' } },
      required: ['count'],
    },
  });

  const answer = { content: [], structuredContent: { count: 'three' } };

  expect(buildCallOutcome('tracker.item_get', form, answer)).toStrictEqual({
    status: 'error',
    message: 'tracker.item_get answered outside its output schema',
  });
});
