import type { EffectDeclaration } from '@heynixie/policy';

// The effect declaration of each tool of the phone module. Every field of a received text is
// outside content, so a result that holds one marks it untrusted. A send checks the number as its
// destination, and its body is free text that an always-allow rule never pins.
export const phoneDeclarations = {
  list: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { number: 'owner_data', texts: 'untrusted', next: 'owner_data' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { from: 'untrusted', body: 'untrusted', at: 'untrusted' },
  },
  send: {
    effects: ['send'],
    destinations: ['to'],
    amount: null,
    content: ['body'],
    results: {},
  },
  forget: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: { text: 'owner_data', status: 'owner_data' },
  },
  wakeSet: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      rule: 'owner_data',
      expiresAt: 'owner_data',
      window: 'owner_data',
      replaced: 'owner_data',
      recent: 'untrusted',
    },
  },
  wakeList: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { rules: 'owner_data' },
  },
  wakeCancel: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: { rule: 'owner_data', ended: 'owner_data' },
  },
} as const satisfies Readonly<Record<string, EffectDeclaration>>;
