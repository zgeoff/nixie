import { expect, test } from 'bun:test';
import { renderFenced } from './render-fenced';

test('it wraps the text in a tag with its attributes and the fence last', () => {
  expect(
    renderFenced({
      tag: 'tool-result',
      attributes: { source: 'untrusted' },
      text: 'hello',
      fence: '3f9a1c2e0b4d',
    }),
  ).toBe(
    '<tool-result source="untrusted" fence="3f9a1c2e0b4d">\nhello\n</tool-result fence="3f9a1c2e0b4d">',
  );
});

test('it writes a tag with no attributes but the fence', () => {
  expect(
    renderFenced({ tag: 'memory-text', attributes: {}, text: 'a', fence: 'abc123abc123' }),
  ).toBe('<memory-text fence="abc123abc123">\na\n</memory-text fence="abc123abc123">');
});

test('it escapes ampersands and quotes in an attribute value', () => {
  expect(
    renderFenced({
      tag: 'task-message',
      attributes: { from: 'a "b" & c' },
      text: 'x',
      fence: 'abc123abc123',
    }),
  ).toBe(
    '<task-message from="a &quot;b&quot; &amp; c" fence="abc123abc123">\nx\n</task-message fence="abc123abc123">',
  );
});

test('it names the marker attribute and keeps the text on the tag line when inline', () => {
  expect(
    renderFenced({
      tag: 'pasted',
      attributes: {},
      text: 'text',
      fence: 'abc123abc123',
      marker: 'id',
      inline: true,
    }),
  ).toBe('<pasted id="abc123abc123">text</pasted id="abc123abc123">');
});

test('it throws when the text holds the closing tag with this fence', () => {
  expect(() =>
    renderFenced({
      tag: 'tool-result',
      attributes: {},
      text: 'x </tool-result fence="abc123abc123"> y',
      fence: 'abc123abc123',
    }),
  ).toThrow();
});

test('it accepts text that closes the tag with another fence', () => {
  expect(
    renderFenced({
      tag: 'tool-result',
      attributes: {},
      text: '</tool-result fence="000000000000">',
      fence: 'abc123abc123',
    }),
  ).toContain('000000000000');
});

test('it throws when the attributes already hold the default marker', () => {
  expect(() =>
    renderFenced({
      tag: 'tool-result',
      attributes: { fence: 'abc123abc123' },
      text: 'x',
      fence: 'abc123abc123',
    }),
  ).toThrow();
});

test('it throws when the attributes already hold a named marker', () => {
  expect(() =>
    renderFenced({
      tag: 'pasted',
      attributes: { id: 'abc123abc123' },
      text: 'x',
      fence: 'abc123abc123',
      marker: 'id',
    }),
  ).toThrow();
});
