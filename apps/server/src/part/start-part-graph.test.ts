import { expect, test } from 'bun:test';
import { MissingPartError } from './missing-part-error';
import { PartCycleError } from './part-cycle-error';
import { PartNotStartedError } from './part-not-started-error';
import { startPartGraph } from './start-part-graph';

test('it starts each part after the parts it needs, whatever order they are declared in', async () => {
  const started: string[] = [];

  const graph = startPartGraph<{ server: string; store: string; writer: string }>([
    {
      name: 'writer',
      needs: ['store'],
      start: (parts) => {
        started.push('writer');

        return Promise.resolve(`writer on ${parts.get('store')}`);
      },
    },
    {
      name: 'store',
      needs: ['server'],
      start: (parts) => {
        started.push('store');

        return Promise.resolve(`store on ${parts.get('server')}`);
      },
    },
    {
      name: 'server',
      needs: [],
      start: () => {
        started.push('server');

        return Promise.resolve('server');
      },
    },
  ]);

  const writer = await graph.waitFor('writer');

  expect(started).toStrictEqual(['server', 'store', 'writer']);
  expect(writer).toBe('writer on store on server');
});

test('it starts the parts that need nothing of each other in the order declared', async () => {
  const started: string[] = [];

  const graph = startPartGraph<{ first: undefined; second: undefined; third: undefined }>([
    {
      name: 'second',
      needs: [],
      start: () => {
        started.push('second');

        return Promise.resolve(undefined);
      },
    },
    {
      name: 'third',
      needs: ['first'],
      start: () => {
        started.push('third');

        return Promise.resolve(undefined);
      },
    },
    {
      name: 'first',
      needs: [],
      start: () => {
        started.push('first');

        return Promise.resolve(undefined);
      },
    },
  ]);

  await graph.done;

  expect(started).toStrictEqual(['second', 'first', 'third']);
});

test('it fails at start with the name of a part that a part needs and no part declares', () => {
  expect(() =>
    startPartGraph<{ memory: string; conversation: string }>([
      {
        name: 'memory',
        needs: ['conversation'],
        start: () => Promise.resolve('memory'),
      },
    ]),
  ).toThrowWithMessage(
    MissingPartError,
    'part memory reads part conversation, which its declarations leave out',
  );
});

test('it fails at start with the name of a part that a part uses and no part declares', () => {
  expect(() =>
    startPartGraph<{ adapter: string; endpoint: string }>([
      {
        name: 'adapter',
        needs: [],
        uses: ['endpoint'],
        start: () => Promise.resolve('adapter'),
      },
    ]),
  ).toThrowWithMessage(
    MissingPartError,
    'part adapter reads part endpoint, which its declarations leave out',
  );
});

test('it fails at start with the names of parts whose needs form a cycle', () => {
  expect(() =>
    startPartGraph<{ conversation: string; memory: string }>([
      { name: 'conversation', needs: ['memory'], start: () => Promise.resolve('conversation') },
      { name: 'memory', needs: ['conversation'], start: () => Promise.resolve('memory') },
    ]),
  ).toThrowWithMessage(
    PartCycleError,
    'parts conversation, memory need each other, so none of them can start first',
  );
});

test('it ends the start at a part that fails and starts none after it', () => {
  const started: string[] = [];

  const graph = startPartGraph<{ images: undefined; conversation: undefined }>([
    {
      name: 'images',
      needs: [],
      start: () => Promise.reject(new Error('impd does not answer')),
    },
    {
      name: 'conversation',
      needs: ['images'],
      start: () => {
        started.push('conversation');

        return Promise.resolve(undefined);
      },
    },
  ]);

  expect(graph.done).rejects.toThrowWithMessage(Error, 'impd does not answer');
  expect(graph.waitFor('conversation')).rejects.toThrowWithMessage(Error, 'impd does not answer');
  expect(started).toStrictEqual([]);
});

test('it starts no part once the signal aborts', () => {
  const graph = startPartGraph<{ store: string }>(
    [{ name: 'store', needs: [], start: () => Promise.resolve('store') }],
    { signal: AbortSignal.abort(new Error('nixie is stopping')) },
  );

  expect(graph.done).rejects.toThrowWithMessage(Error, 'nixie is stopping');
});

test('it lets a part read a part it uses once that part starts after it', async () => {
  const graph = startPartGraph<{ adapter: () => string; endpoint: string }>([
    {
      name: 'adapter',
      needs: [],
      uses: ['endpoint'],
      start: (parts) => Promise.resolve(() => parts.get('endpoint')),
    },
    { name: 'endpoint', needs: ['adapter'], start: () => Promise.resolve('endpoint') },
  ]);

  await graph.done;

  const readEndpoint = await graph.waitFor('adapter');

  expect(readEndpoint()).toBe('endpoint');
});

test('it finds no value for a part that a part uses before that part starts', async () => {
  const graph = startPartGraph<{ adapter: string | null; endpoint: string }>([
    {
      name: 'adapter',
      needs: [],
      uses: ['endpoint'],
      start: (parts) => Promise.resolve(parts.find('endpoint')),
    },
    { name: 'endpoint', needs: ['adapter'], start: () => Promise.resolve('endpoint') },
  ]);

  const found = await graph.waitFor('adapter');

  expect(found).toBeNull();
});

test('it throws with the name of a part that a part reads before that part starts', () => {
  const graph = startPartGraph<{ adapter: string; endpoint: string }>([
    {
      name: 'adapter',
      needs: [],
      uses: ['endpoint'],
      start: (parts) => Promise.resolve(parts.get('endpoint')),
    },
    { name: 'endpoint', needs: ['adapter'], start: () => Promise.resolve('endpoint') },
  ]);

  expect(graph.done).rejects.toThrowWithMessage(
    PartNotStartedError,
    'part endpoint has not started',
  );
});

test('it throws when a part reads a part its declaration leaves out', () => {
  const graph = startPartGraph<{ store: string; writer: string }>([
    { name: 'store', needs: [], start: () => Promise.resolve('store') },
    { name: 'writer', needs: [], start: (parts) => Promise.resolve(parts.get('store')) },
  ]);

  expect(graph.done).rejects.toThrowWithMessage(
    MissingPartError,
    'part writer reads part store, which its declarations leave out',
  );
});
