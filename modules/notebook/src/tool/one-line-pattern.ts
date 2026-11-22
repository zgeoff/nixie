import type { JsonSchema } from '@heynixie/tools';
import { linkTypes } from '../types';

// one line: no line break
export const oneLinePattern = String.raw`^[^\r\n]+$`;

export const titleInput: JsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  pattern: oneLinePattern,
  description: 'one line, 1 to 200 characters',
};

export const tagsInput: JsonSchema = {
  type: 'array',
  maxItems: 10,
  items: { type: 'string', minLength: 1, maxLength: 40, pattern: oneLinePattern },
  description:
    'up to 10 tags, each one line of 1 to 40 characters; tags that match ignoring case merge',
};

export const noteIDInput: JsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  description: "a note's ID",
};

export const linkTypeInput: JsonSchema = { type: 'string', enum: [...linkTypes] };

export const linkTargetInput: JsonSchema = {
  type: 'object',
  properties: {
    note: { type: 'string', minLength: 1, maxLength: 64, description: "a note's ID" },
    memory: { type: 'string', minLength: 1, maxLength: 64, description: "a memory item's itemID" },
    moment: { type: 'string', minLength: 1, maxLength: 64, description: "a moment's momentID" },
    event: {
      type: 'string',
      minLength: 1,
      maxLength: 15,
      description: 'the decimal eventID that log.read shows, on your own thread',
    },
  },
  minProperties: 1,
  maxProperties: 1,
  additionalProperties: false,
  description: 'what the link points at: exactly one of note, memory, moment or event',
};

export const refusalOutput = {
  refused: { type: 'string', description: 'the code of the refusal' },
  message: { type: 'string' },
};

export const ownerData = 'owner_data';
export const untrusted = 'untrusted';
