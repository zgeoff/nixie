export const envelopeLabels = {
  conversation: '{agent}, in the chat with {owner}',
  personaTask: '{agent} (task: {name})',
  personaTaskReport: '{agent} (task: {name} ({id}))',
  personaUnnamedTaskReport: '{agent} (task: {id})',
  plainTask: 'task: {name}',
  plainTaskReport: 'task: {name} ({id})',
  plainUnnamedTaskReport: 'task: {id}',
  definition: 'task definition: {name}',
} as const;
