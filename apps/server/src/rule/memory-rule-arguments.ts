// The arguments that a rule can check on each memory tool. `subject` is the subject of the item
// the write ends up under: the call's own, or the item's when the call leaves it out, and for
// memory.retopic the subject the call moves to.
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
  'memory.retopic': ['subject', 'items', 'from.topic', 'from.subject', 'to.topic', 'to.subject'],
  'memory.retire': ['subject', 'itemID', 'intentQuote'],
  'memory.pin': ['subject', 'itemID'],
  'memory.unpin': ['itemID'],
} as const;
