import type { JSONObject } from '@heynixie/log';
import type { CodingSettings } from '../types';
import { wakeEvents } from './wake-events';

// The JSON schema of the `coding.start` tool, as the model reads it.
export function buildCodingStartInput(settings: CodingSettings): JSONObject {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 },
      brief: {
        type: 'string',
        minLength: 1,
        maxLength: 8000,
        description:
          "with repo: the session's first user turn, which the coding agent works from; with " +
          'session: your own note on the task, which the session never gets',
      },
      repo: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'an https:// or ssh URL of a git repository' },
          ref: { type: 'string', description: 'the branch, tag or commit to check out' },
        },
        required: ['url', 'ref'],
        additionalProperties: false,
        description: 'starts a new coding session on this repository; leave out session',
      },
      target: {
        type: 'string',
        enum: settings.targets.map((target) => `${target.daemon}/${target.target}`),
        description: 'only with repo: where the session runs; leave it out for the usual one',
      },
      agent: { type: 'string', description: 'only with repo: the coding agent to run' },
      model: { type: 'string', description: 'only with repo: the model of the coding agent' },
      session: {
        type: 'string',
        description:
          'joins a running session by its ID from coding.sessions, and sends it nothing; leave ' +
          'out repo',
      },
      wake: {
        type: 'array',
        items: { type: 'string', enum: [...wakeEvents] },
        uniqueItems: true,
        description:
          "the session events that wake you; leave it out for the usual set. The session's end " +
          'always reaches you',
      },
    },
    required: ['name', 'brief'],
    additionalProperties: false,
  };
}
