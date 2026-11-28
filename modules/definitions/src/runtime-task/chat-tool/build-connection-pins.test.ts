import { expect, test } from 'bun:test';
import { buildConnectionPins, collectUsableConnections } from './build-connection-pins';

interface PinFacts {
  readonly tools: readonly string[];
  readonly named: readonly string[] | null;
}

function setupTest() {
  const usable = {
    'gmail.search': ['k3x9m2p7qa'],
    'drive.search': ['k3x9m2p7qa', 'p8d2v6n4rc'],
    'calendar.list_events': ['k3x9m2p7qa', 'p8d2v6n4rc'],
  };

  return {
    usable,
    pin: (facts: PinFacts) =>
      buildConnectionPins({ tools: facts.tools, named: facts.named ?? undefined, usable }),
  };
}

test('it pins each listed connector tool to the named connections that hold its scopes', () => {
  const ctx = setupTest();

  const pins = ctx.pin({
    tools: ['gmail.search', 'drive.search', 'time.now'],
    named: ['k3x9m2p7qa', 'p8d2v6n4rc'],
  });

  expect(pins).toStrictEqual({
    status: 'pinned',
    pins: { 'gmail.search': ['k3x9m2p7qa'], 'drive.search': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
  });
});

test('it never pins a tool to an account that lacks its scope', () => {
  const ctx = setupTest();
  const pins = ctx.pin({ tools: ['gmail.search', 'drive.search'], named: null });

  expect(pins).toStrictEqual({
    status: 'pinned',
    pins: { 'gmail.search': ['k3x9m2p7qa'], 'drive.search': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
  });
});

test('it reads a tool listed by the name the model sees', () => {
  const ctx = setupTest();
  const pins = ctx.pin({ tools: ['mcp__nixie__gmail_search'], named: null });

  expect(pins).toStrictEqual({ status: 'pinned', pins: { 'gmail.search': ['k3x9m2p7qa'] } });
});

test('it refuses a connection that no listed tool can use', () => {
  const ctx = setupTest();
  const pins = ctx.pin({ tools: ['gmail.search'], named: ['p8d2v6n4rc'] });

  expect(pins).toStrictEqual({ status: 'refused', unusable: ['p8d2v6n4rc'] });
});

test('it pins nothing when the list holds no connector tool', () => {
  const ctx = setupTest();
  const pins = ctx.pin({ tools: ['time.now'], named: null });

  expect(pins).toStrictEqual({ status: 'pinned', pins: {} });
});

test('it collects the connections that hold the scopes of any listed connector tool', () => {
  const ctx = setupTest();

  expect(collectUsableConnections(['gmail.search'], ctx.usable)).toStrictEqual(['k3x9m2p7qa']);
});

test('it collects nothing when the list holds no connector tool', () => {
  const ctx = setupTest();

  expect(collectUsableConnections(['time.now'], ctx.usable)).toBeNull();
});
