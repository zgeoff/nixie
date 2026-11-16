// The JSON schema of the label fields that memory.remember and memory.edit share. The pattern keeps
// each label to one line.
const oneLine = String.raw`^[^\n\r\u2028\u2029]+$`;

const gist = {
  type: 'string',
  minLength: 1,
  maxLength: 80,
  pattern: oneLine,
  description:
    'a one-line summary of the item that tells it apart from the others in a list, up to 80 characters',
};

const topic = {
  type: 'string',
  minLength: 1,
  maxLength: 40,
  pattern: oneLine,
  description:
    'the one topic the item belongs to, such as home or work/standups, up to 40 characters',
};

const triggers = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 60, pattern: oneLine },
  maxItems: 5,
  description:
    'up to 5 short phrases that bring the item up when the owner says them; a broad phrase ' +
    'matches almost every turn',
};

const description =
  'Every item has a gist, a topic and up to 5 trigger phrases. Reuse a topic that exists when one ' +
  'fits, and create one without asking when none fits. A broad trigger phrase such as `home` ' +
  'matches almost every turn, so pass only phrases that are specific to the item.';

export const labelInputSchema = { gist, topic, triggers, description };
