export const reminderToolParts = {
  noteDeclaration: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
  },
  refusedOutput: {
    type: 'object',
    description:
      'the code of the refusal, the field it is about, and a sentence that says what to change',
  },
  triggerWords: 'the trigger in words, naming the zone',
  nextFires: {
    type: 'array',
    items: { type: 'string' },
    description: 'the next 3 fires, in local time with the offset of the zone',
  },
} as const;
