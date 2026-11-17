// The arguments that a rule can check on each memory tool. `subject` is the subject of the item
// the write ends up under: the call's own, or the item's when the call leaves it out.
export const memoryRuleArguments = {
  'memory.remember': [
    'subject',
    'text',
    'gist',
    'topic',
    'triggers',
    'quote',
    'eventID',
    'until',
    'image.eventID',
    'image.number',
  ],
  'memory.edit': [
    'subject',
    'itemID',
    'text',
    'gist',
    'topic',
    'triggers',
    'quote',
    'eventID',
    'until',
  ],
  'memory.retire': ['subject', 'itemID', 'intentQuote'],
  'memory.pin': ['subject', 'itemID'],
  'memory.unpin': ['itemID'],
} as const;
