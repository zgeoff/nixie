import { expect, test } from 'bun:test';
import { pickModelRefusal } from './pick-model-refusal';

test('#pickModelRefusal accepts a request that held the text', () => {
  expect(pickModelRefusal(1, 'Tabs: t1')).toBeNull();
});

test('#pickModelRefusal refuses when no request held the text', () => {
  expect(pickModelRefusal(0, 'Tabs: t1')).toBe('no request of the model held the text: Tabs: t1');
});
