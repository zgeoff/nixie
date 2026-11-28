import { expect, test } from 'bun:test';
import { buildConnectionPins } from './build-connection-pins';

interface PinFacts {
  readonly tools: readonly string[];
  readonly named: readonly string[] | null;
  readonly usable: readonly string[];
}

function setupTest() {
  return {
    pin: (facts: PinFacts) =>
      buildConnectionPins({
        tools: facts.tools,
        named: facts.named ?? undefined,
        usable: facts.usable,
        connectorTools: ['gmail.search', 'calendar.list_events'],
      }),
  };
}

test('it pins each listed connector tool to the connections the call named', () => {
  const ctx = setupTest();

  const pins = ctx.pin({
    tools: ['gmail.search', 'time.now'],
    named: ['k3x9m2p7qa'],
    usable: ['k3x9m2p7qa', 'p8d2v6n4rc'],
  });

  expect(pins).toStrictEqual({
    status: 'pinned',
    pins: { 'gmail.search': ['k3x9m2p7qa'] },
  });
});

test('it pins every usable connection when the call names none', () => {
  const ctx = setupTest();

  const pins = ctx.pin({
    tools: ['gmail.search', 'calendar.list_events'],
    named: null,
    usable: ['k3x9m2p7qa', 'p8d2v6n4rc'],
  });

  expect(pins).toStrictEqual({
    status: 'pinned',
    pins: {
      'gmail.search': ['k3x9m2p7qa', 'p8d2v6n4rc'],
      'calendar.list_events': ['k3x9m2p7qa', 'p8d2v6n4rc'],
    },
  });
});

test('it reads a tool listed by the name the model sees', () => {
  const ctx = setupTest();

  const pins = ctx.pin({
    tools: ['mcp__nixie__gmail_search'],
    named: null,
    usable: ['k3x9m2p7qa'],
  });

  expect(pins).toStrictEqual({ status: 'pinned', pins: { 'gmail.search': ['k3x9m2p7qa'] } });
});

test('it refuses a connection the caller may not use', () => {
  const ctx = setupTest();

  const pins = ctx.pin({
    tools: ['gmail.search'],
    named: ['zzzzzzzzzz'],
    usable: ['k3x9m2p7qa'],
  });

  expect(pins).toStrictEqual({ status: 'refused', unusable: ['zzzzzzzzzz'] });
});

test('it pins nothing when the list holds no connector tool', () => {
  const ctx = setupTest();
  const pins = ctx.pin({ tools: ['time.now'], named: null, usable: ['k3x9m2p7qa'] });

  expect(pins).toStrictEqual({ status: 'pinned', pins: {} });
});
