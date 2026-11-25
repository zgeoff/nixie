import type { EffectDeclaration } from '@heynixie/policy';

// A steer and a note name their session as '<adapter ID>:<session ID>', filled from the task's bound
// session, which the starter rules match.
const inputDeclaration: EffectDeclaration = {
  effects: ['send'],
  destinations: ['session'],
  amount: null,
  content: ['text'],
  results: {},
};

// The calls of coding.steer and coding.message only queue their action on the coding task's
// thread; each attempt of that action meets the decision point under the action's own declaration.
const queueDeclaration: EffectDeclaration = {
  effects: ['note'],
  destinations: [],
  amount: null,
  content: ['text'],
  results: {},
};

// The effect declaration of each tool of the coding module, of each action that the coding runner
// queues, and of the start variant.
export const codingDeclarations = {
  // `coding.start`, for a start and a join alike
  start: {
    effects: ['coding_start'],
    destinations: [],
    amount: null,
    content: ['brief', 'name'],
    results: { taskID: 'owner_data', name: 'owner_data', note: 'owner_data' },
  },

  // `coding.spawn`: the spawn that a start queues
  spawn: {
    effects: ['coding_start'],
    destinations: [],
    amount: null,
    content: ['prompt', 'name'],
    results: {},
  },

  // `coding.stop`: the stop that a stop of the task queues for a session it started. `origin`, which
  // the starter rules match, is 'started'.
  stop: {
    effects: ['coding_start'],
    destinations: ['session'],
    amount: null,
    content: ['origin'],
    results: {},
  },
  steer: inputDeclaration,
  message: inputDeclaration,
  steerCall: queueDeclaration,
  messageCall: queueDeclaration,
  sessions: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: { sessions: 'untrusted' },
  },
  read: {
    effects: ['read'],
    destinations: [],
    amount: null,
    content: [],
    results: {
      state: 'untrusted',
      question: 'untrusted',
      lastReply: 'untrusted',
      prompt: 'untrusted',
      tail: 'untrusted',
    },
  },
  watch: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
    results: { wake: 'owner_data' },
  },
} as const satisfies Readonly<Record<string, EffectDeclaration>>;

// The declarations that each attempt of a coding action meets the decision point under, by the
// action's tool.
export const codingActionDeclarations: ReadonlyMap<string, EffectDeclaration> = new Map([
  ['coding.spawn', codingDeclarations.spawn],
  ['coding.steer', codingDeclarations.steer],
  ['coding.message', codingDeclarations.message],
  ['coding.stop', codingDeclarations.stop],
]);
