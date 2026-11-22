import { expect, test } from 'bun:test';
import { parseNoteTags } from './parse-note-tags';

test.each([
  [undefined, []],
  ['', []],
  ['home', ['home']],
  [' home , boiler,,', ['home', 'boiler']],
])('it splits the tags %j', (tags, expected) => {
  expect(parseNoteTags(tags)).toStrictEqual(expected);
});
