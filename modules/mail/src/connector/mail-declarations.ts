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
    results: { mails: 'untrusted', next: 'owner_data' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      from: 'untrusted',
      thread: 'owner_data',
      to: 'untrusted',
      cc: 'untrusted',
      subject: 'untrusted',
      text: 'untrusted',
      attachments: 'untrusted',
    },
  },
  saveAttachment: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      file: 'untrusted',
      name: 'untrusted',
      bytes: 'untrusted',
      mediaType: 'untrusted',
      files: 'untrusted',
      stdout: 'owner_data',
      stderr: 'owner_data',
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
