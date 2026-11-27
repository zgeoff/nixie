import { expect, test } from 'bun:test';
import { collectReachedFolders } from './collect-reached-folders';

test.each([
  {
    title: 'a seed with no dependencies',
    seeds: ['modules/kettle'],
    packages: [{ folder: 'modules/kettle', name: '@heynixie/kettle', workspaceDependencies: [] }],
    reached: ['modules/kettle'],
  },
  {
    title: 'the dependencies of a dependency',
    seeds: ['adapters/kettle-steam'],
    packages: [
      {
        folder: 'adapters/kettle-steam',
        name: '@heynixie/kettle-steam',
        workspaceDependencies: ['@heynixie/kettle'],
      },
      {
        folder: 'modules/kettle',
        name: '@heynixie/kettle',
        workspaceDependencies: ['@heynixie/clock'],
      },
      { folder: 'libs/clock', name: '@heynixie/clock', workspaceDependencies: [] },
      { folder: 'modules/teapot', name: '@heynixie/teapot', workspaceDependencies: [] },
    ],
    reached: ['adapters/kettle-steam', 'libs/clock', 'modules/kettle'],
  },
  {
    title: 'each package of a cycle once',
    seeds: ['modules/cup'],
    packages: [
      { folder: 'modules/cup', name: '@heynixie/cup', workspaceDependencies: ['@heynixie/saucer'] },
      {
        folder: 'modules/saucer',
        name: '@heynixie/saucer',
        workspaceDependencies: ['@heynixie/cup'],
      },
    ],
    reached: ['modules/cup', 'modules/saucer'],
  },
  {
    title: 'a seed folder with no package, as after its deletion',
    seeds: ['modules/gone'],
    packages: [],
    reached: ['modules/gone'],
  },
  {
    title: 'no folder for a dependency outside the workspace folders',
    seeds: ['modules/kettle'],
    packages: [
      {
        folder: 'modules/kettle',
        name: '@heynixie/kettle',
        workspaceDependencies: ['@heynixie/elsewhere'],
      },
    ],
    reached: ['modules/kettle'],
  },
])('it reaches $title', (row) => {
  expect(collectReachedFolders(row.seeds, row.packages)).toStrictEqual([...row.reached]);
});
