import { expect, test } from 'bun:test';
import { buildServerToolSource } from './build-server-tool-source';

test('#buildServerToolSource serves no name until a test exposes it', () => {
  const server = buildServerToolSource(['boxxy.item_get', 'boxxy.item_list']);
  const before = server.source.toolNames();

  server.expose(['boxxy.item_get']);

  expect([before, server.source.toolNames()]).toStrictEqual([[], ['boxxy.item_get']]);
});

test('#buildServerToolSource finds only an exposed tool', () => {
  const server = buildServerToolSource(['boxxy.item_get', 'boxxy.item_list']);

  server.expose(['boxxy.item_get']);

  expect([
    server.source.findTool('boxxy.item_get')?.definition.name,
    server.source.findTool('boxxy.item_list'),
  ]).toStrictEqual(['boxxy.item_get', null]);
});

test('#buildServerToolSource names the servers it serves', () => {
  expect(buildServerToolSource([]).source.serverIDs?.()).toStrictEqual(['boxxy', 'boxxy2']);
});
