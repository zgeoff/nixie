import { expect, test } from 'bun:test';
import { pickModelInputRefusal } from './pick-model-input-refusal';

test('#pickModelInputRefusal accepts an input that holds the text', () => {
  expect(pickModelInputRefusal('{"exitCode":0}', 'exitCode')).toBeNull();
});

test('#pickModelInputRefusal refuses an input that lacks the text', () => {
  expect(pickModelInputRefusal('null', 'exitCode')).toBe(
    'the model\'s last input lacks "exitCode"; it is null',
  );
});
