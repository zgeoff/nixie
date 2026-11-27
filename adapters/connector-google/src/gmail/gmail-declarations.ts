import type { ToolDefinition } from '@heynixie/connections';

type Declaration = ToolDefinition['declaration'];

// The effect declaration of each Gmail tool. Every field that holds a mail's words is outside
// content, so a result that holds one marks it untrusted. A tool whose destinations come from a
// message reads them in `prepare`, so its declaration lists none.
export const gmailDeclarations = {
  search: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { messages: 'untrusted', next: 'owner_data' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      message: 'owner_data',
      thread: 'owner_data',
      from: 'untrusted',
      replyTo: 'untrusted',
      to: 'untrusted',
      cc: 'untrusted',
      subject: 'untrusted',
      date: 'untrusted',
      labels: 'owner_data',
      text: 'untrusted',
      part: 'owner_data',
      parts: 'owner_data',
      unsupported: 'untrusted',
      attachments: 'untrusted',
    },
  },
  readAttachment: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      name: 'untrusted',
      type: 'untrusted',
      bytes: 'untrusted',
      text: 'untrusted',
      part: 'owner_data',
      parts: 'owner_data',
      unsupported: 'untrusted',
      image: 'untrusted',
    },
  },
  label: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: [],
    results: { threads: 'owner_data', created: 'owner_data' },
  },
  draft: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: ['subject', 'text'],
    results: { draft: 'owner_data' },
  },
  send: {
    effects: ['send'],
    destinations: ['to', 'cc', 'bcc'],
    amount: null,
    content: ['subject', 'text'],
    results: { message: 'owner_data', thread: 'owner_data', replyRule: 'owner_data' },
  },
  reply: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: ['text'],
    results: { message: 'owner_data', thread: 'owner_data', replyRule: 'owner_data' },
  },
  sendDraft: {
    effects: ['send'],
    destinations: [],
    amount: null,
    content: [],
    results: { message: 'owner_data', thread: 'owner_data', replyRule: 'owner_data' },
  },
  wakeSet: {
    effects: ['schedule', 'write'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      rule: 'owner_data',
      expiresAt: 'owner_data',
      window: 'owner_data',
      replaced: 'owner_data',
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
} as const satisfies Readonly<Record<string, Declaration>>;
