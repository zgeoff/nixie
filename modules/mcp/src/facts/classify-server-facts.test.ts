import { expect, test } from 'bun:test';
import { buildServerFacts } from '../test-utils/build-server-facts';
import type { ServerFacts } from '../types';
import { classifyServerFacts } from './classify-server-facts';
import type { FactsChange } from './classify-server-facts';

test.each<{ title: string; asked: Partial<ServerFacts>; change: FactsChange }>([
  { title: 'the same facts', asked: {}, change: 'same' },
  { title: 'the same scopes in another order', asked: { scope: 'write read' }, change: 'same' },
  { title: 'a new URL', asked: { url: 'https://tracker.example.org/other' }, change: 'widened' },
  { title: 'a new client ID', asked: { clientID: 'nixie-9' }, change: 'widened' },
  { title: 'one more scope', asked: { scope: 'read write admin' }, change: 'widened' },
  {
    title: 'a range where there was none',
    asked: { privateRange: '10.0.0.0/24' },
    change: 'widened',
  },
  { title: 'one fewer scope', asked: { scope: 'read' }, change: 'narrowed' },
  { title: 'a scope swapped for another', asked: { scope: 'read admin' }, change: 'widened' },
])('it classifies $title as $change', (row) => {
  expect(classifyServerFacts(buildServerFacts(), buildServerFacts(row.asked))).toBe(row.change);
});

test.each<{
  title: string;
  inUse: Partial<ServerFacts>;
  asked: Partial<ServerFacts>;
  change: FactsChange;
}>([
  {
    title: 'a range removed',
    inUse: { privateRange: '10.0.0.0/24' },
    asked: { privateRange: null },
    change: 'narrowed',
  },
  {
    title: 'a range inside the old one',
    inUse: { privateRange: '10.0.0.0/16' },
    asked: { privateRange: '10.0.4.0/24' },
    change: 'narrowed',
  },
  {
    title: 'a range around the old one',
    inUse: { privateRange: '10.0.4.0/24' },
    asked: { privateRange: '10.0.0.0/16' },
    change: 'widened',
  },
  {
    title: 'a range beside the old one',
    inUse: { privateRange: '10.0.4.0/24' },
    asked: { privateRange: '10.0.5.0/24' },
    change: 'widened',
  },
  {
    title: 'the same range written with host bits',
    inUse: { privateRange: '10.0.4.0/24' },
    asked: { privateRange: '10.0.4.7/24' },
    change: 'same',
  },
  {
    title: 'a wider scope list that also drops a range',
    inUse: { privateRange: '10.0.0.0/24' },
    asked: { scope: 'read write admin', privateRange: null },
    change: 'widened',
  },
])('it classifies $title as $change', (row) => {
  expect(classifyServerFacts(buildServerFacts(row.inUse), buildServerFacts(row.asked))).toBe(
    row.change,
  );
});
