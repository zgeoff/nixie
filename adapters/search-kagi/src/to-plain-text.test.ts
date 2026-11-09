import { expect, test } from 'bun:test';
import { toPlainText } from './to-plain-text';

test.each([
  ['a bold word', 'New <strong>Dungeons</strong> list', 'New Dungeons list'],
  ['a numeric entity', 'the dungeon&#39;s boss', "the dungeon's boss"],
  ['a named entity', 'Tides &amp; currents', 'Tides & currents'],
  ['an escaped tag', 'write &lt;b&gt; for bold', 'write <b> for bold'],
  ['a tag with attributes', '<a href="https://tides.test/">Tides</a> today', 'Tides today'],
])('it turns %s into plain text', (_, html, text) => {
  expect(toPlainText(html)).toBe(text);
});
