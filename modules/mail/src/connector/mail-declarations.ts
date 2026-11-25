import type { EffectDeclaration } from '@heynixie/policy';

// The effect declaration of each tool of the mail module. Every field of an incoming mail is outside
// content, so a result that holds one marks it untrusted. A send checks each recipient as a
// destination, and a reply checks the sender of the mail it answers.
export const mailDeclarations = {
  list: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { mails: 'untrusted' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      from: 'untrusted',
      to: 'untrusted',
      cc: 'untrusted',
      subject: 'untrusted',
      text: 'untrusted',
      attachments: 'untrusted',
    },
  },
  send: {
    effects: ['send'],
    destinations: ['to'],
    amount: null,
    content: ['subject', 'text'],
    results: {},
  },
  reply: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: ['text'],
    results: {},
  },
  wakeSet: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: { recent: 'untrusted' },
  },
  wakeList: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  },
  wakeCancel: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: {},
  },
} as const satisfies Readonly<Record<string, EffectDeclaration>>;
