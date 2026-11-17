export const reminderToolParts = {
  noteDeclaration: {
    effects: ['note'],
    destinations: [],
    amount: null,
    content: [],
  },
  refusedOutput: {
    type: 'object',
    description: 'the code of the refusal and a sentence that says what to change',
  },
  triggerWords: 'the trigger in words',
} as const;
