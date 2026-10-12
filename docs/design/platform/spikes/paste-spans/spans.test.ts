import { expect, test } from 'bun:test';
import { applyEdit, findEdit, getSpanText } from './spans.ts';

test('it labels typed, pasted and typed-again text with their sources', () => {
  const typed = applyEdit([], findEdit('', 'hello '), 'typed');
  const pasted = applyEdit(typed, findEdit('hello ', 'hello PASTED'), 'pasted');

  const spans = applyEdit(pasted, findEdit('hello PASTED', 'hello PASTED world'), 'typed');

  expect(getSpanText('hello PASTED world', spans)).toStrictEqual([
    'typed:"hello "',
    'pasted:"PASTED"',
    'typed:" world"',
  ]);
});

test('it splits a pasted span around text typed inside it', () => {
  const pasted = applyEdit([], findEdit('', 'PASTED'), 'pasted');

  const spans = applyEdit(
    pasted,
    findEdit('PASTED', 'PASxTED', { backward: false, end: 3, start: 3 }),
    'typed',
  );

  expect(getSpanText('PASxTED', spans)).toStrictEqual(['pasted:"PAS"', 'typed:"x"', 'pasted:"TED"']);
});

test('it places a paste next to repeated text at the caret', () => {
  const typed = applyEdit([], findEdit('', 'ab'), 'typed');

  const spans = applyEdit(
    typed,
    findEdit('ab', 'abab', { backward: false, end: 1, start: 1 }),
    'pasted',
  );

  expect(getSpanText('abab', spans)).toStrictEqual(['typed:"a"', 'pasted:"ba"', 'typed:"b"']);
});

test('it places a paste next to repeated text at the end when no caret is known', () => {
  const typed = applyEdit([], findEdit('', 'ab'), 'typed');

  const spans = applyEdit(typed, findEdit('ab', 'abab'), 'pasted');

  expect(getSpanText('abab', spans)).toStrictEqual(['typed:"ab"', 'pasted:"ab"']);
});

test('it keeps the untouched parts of a replacement over a span boundary', () => {
  const typed = applyEdit([], findEdit('', 'hello '), 'typed');
  const pasted = applyEdit(typed, findEdit('hello ', 'hello PASTED'), 'pasted');

  const spans = applyEdit(
    pasted,
    findEdit('hello PASTED', 'helXTED', { backward: false, end: 9, start: 3 }),
    'typed',
  );

  expect(getSpanText('helXTED', spans)).toStrictEqual(['typed:"helX"', 'pasted:"TED"']);
});

test('it labels the whole paste over a selection as pasted', () => {
  const typed = applyEdit([], findEdit('', 'cat'), 'typed');

  const spans = applyEdit(
    typed,
    findEdit('cat', 'bat', { backward: false, end: 3, start: 0 }),
    'pasted',
  );

  expect(getSpanText('bat', spans)).toStrictEqual(['pasted:"bat"']);
});

test('it removes the typed character on a backspace between a typed and a pasted one', () => {
  const typed = applyEdit([], findEdit('', 'a'), 'typed');
  const pasted = applyEdit(typed, findEdit('a', 'aa'), 'pasted');

  const spans = applyEdit(
    pasted,
    findEdit('aa', 'a', { backward: true, end: 1, start: 1 }),
    'unknown',
  );

  expect(getSpanText('a', spans)).toStrictEqual(['pasted:"a"']);
});

test('it removes the pasted character on a forward delete between a typed and a pasted one', () => {
  const typed = applyEdit([], findEdit('', 'a'), 'typed');
  const pasted = applyEdit(typed, findEdit('a', 'aa'), 'pasted');

  const spans = applyEdit(
    pasted,
    findEdit('aa', 'a', { backward: false, end: 1, start: 1 }),
    'unknown',
  );

  expect(getSpanText('a', spans)).toStrictEqual(['typed:"a"']);
});
