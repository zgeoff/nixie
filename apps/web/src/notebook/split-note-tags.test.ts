import { expect, test } from 'bun:test';
import { splitNoteTags } from './split-note-tags';

test.each([
  [undefined, []],
  ['', []],
  ['home', ['home']],
  [' home , boiler,,', ['home', 'boiler']],
])('it splits the tags %j', (tags, expected) => {
  expect(splitNoteTags(tags)).toStrictEqual(expected);
});
