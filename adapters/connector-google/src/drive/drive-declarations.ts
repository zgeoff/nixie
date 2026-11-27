import type { ToolDefinition } from '@heynixie/connections';

type Declaration = ToolDefinition['declaration'];

// The effect declaration of each Drive tool. A file's name and text are outside content, and a Drive
// write reaches no one else, so it declares no destination.
export const driveDeclarations = {
  search: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { files: 'untrusted', next: 'owner_data', note: 'owner_data' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      file: 'owner_data',
      name: 'untrusted',
      type: 'untrusted',
      bytes: 'untrusted',
      modifiedAt: 'untrusted',
      version: 'untrusted',
      text: 'untrusted',
      part: 'owner_data',
      parts: 'owner_data',
      unsupported: 'untrusted',
      image: 'untrusted',
    },
  },
  create: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: ['name', 'text'],
    results: { file: 'owner_data', link: 'owner_data' },
  },
  change: {
    effects: ['write'],
    destinations: [],
    amount: null,
    content: ['name', 'text'],
    results: { file: 'owner_data', link: 'owner_data' },
  },
} as const satisfies Readonly<Record<string, Declaration>>;
