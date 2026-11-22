import { expect, test } from 'bun:test';
import { buildLinkRow } from '../test-utils/build-link-row';
import { collectNeighbors } from './collect-neighbors';

test('it follows a note own links and the links of other notes to it', () => {
  const links = [
    buildLinkRow({
      link_key: '1',
      from_note_id: 'note-a',
      target_kind: 'memory',
      target_id: 'item-1',
    }),
    buildLinkRow({
      link_key: '2',
      from_note_id: 'note-b',
      target_kind: 'note',
      target_id: 'note-a',
    }),
    buildLinkRow({
      link_key: '3',
      from_note_id: 'note-c',
      target_kind: 'memory',
      target_id: 'item-9',
    }),
  ];

  const neighbors = collectNeighbors(links, { kind: 'note', id: 'note-a' }, undefined);

  expect(neighbors.map((neighbor) => neighbor.node)).toStrictEqual([
    { kind: 'memory', id: 'item-1' },
    { kind: 'note', id: 'note-b' },
  ]);
});

test('it passes through a memory item to the other notes that cite it', () => {
  const links = [
    buildLinkRow({ link_key: '1', from_note_id: 'note-a', target_id: 'item-1' }),
    buildLinkRow({ link_key: '2', from_note_id: 'note-b', target_id: 'item-1', type: 'disputes' }),
  ];

  const neighbors = collectNeighbors(links, { kind: 'memory', id: 'item-1' }, undefined);

  expect(neighbors.map((neighbor) => neighbor.node.id)).toStrictEqual(['note-a', 'note-b']);
});

test('it follows only the link types it is given', () => {
  const links = [
    buildLinkRow({ link_key: '1', type: 'cites' }),
    buildLinkRow({ link_key: '2', type: 'disputes', target_id: 'item-2' }),
  ];

  const neighbors = collectNeighbors(links, { kind: 'note', id: 'note-a' }, ['disputes']);

  expect(neighbors.map((neighbor) => neighbor.node.id)).toStrictEqual(['item-2']);
});

test('it leaves a moment with no neighbor when no note links to it', () => {
  expect(
    collectNeighbors([buildLinkRow({})], { kind: 'moment', id: 'm-1' }, undefined),
  ).toStrictEqual([]);
});
