import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import type { MomentStore } from './build-moment-store';
import { makeInputRecorder } from './make-input-recorder';
import { parseUTCTime } from './parse-utc-time';
import type { MomentMatch } from './read-moment-matches';
import { utcTimePattern } from './utc-time-pattern';

const findArguments = z.object({
  query: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeRetired: z.boolean().optional(),
  before: z.string().optional(),
  limit: z.int().optional(),
});

const defaultLimit = 10;

export function buildMomentFindTool(moments: Pick<MomentStore, 'readMatches'>): ToolDefinition {
  return {
    name: 'moment.find',
    description:
      'Finds kept moments. Pass query for moments whose title, note or reflections hold the ' +
      'words, best match first; leave it out to list moments newest first, a page at a time, ' +
      'with before set to the next cursor of the page before. from and to narrow either one to ' +
      'when the moment was kept. Each moment comes with its momentID and title; read one whole ' +
      'with moment.read when the reason behind a fact matters.',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200 },
        from: {
          type: 'string',
          pattern: utcTimePattern,
          description: 'moments kept from this UTC date or time, such as 2026-10-12',
        },
        to: {
          type: 'string',
          pattern: utcTimePattern,
          description: 'moments kept before this UTC date or time',
        },
        includeRetired: { type: 'boolean' },
        before: { type: 'string', pattern: '^[0-9]{1,15}$' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        moments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              momentID: { type: 'string' },
              version: { type: 'integer' },
              title: { type: ['string', 'null'] },
              keptAt: { type: 'string' },
              state: { type: 'string', enum: ['active', 'retired'] },
            },
            required: ['momentID', 'version', 'title', 'keptAt', 'state'],
          },
        },
        next: { type: ['string', 'null'] },
      },
      required: ['moments', 'next'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: ['query'],
      results: { moments: 'untrusted', next: 'owner_data' },
    },
    execution: 'direct',

    recordInput: makeInputRecorder(['query']),
    run: async (call) => {
      const input = findArguments.parse(call.input);
      const from = parseUTCTime(input.from);
      const to = parseUTCTime(input.to);

      if (Number.isNaN(from) || Number.isNaN(to)) {
        return { status: 'error', message: 'from and to must be real UTC dates or times' };
      }

      const page = await moments.readMatches({
        words: input.query === undefined ? [] : input.query.split(/\s+/u),
        from,
        to,
        includeRetired: input.includeRetired === true,
        before: input.before === undefined ? null : Number(input.before),
        limit: input.limit ?? defaultLimit,
      });

      const next = page.next === null ? null : String(page.next);

      return {
        status: 'ok',
        result: { moments: page.matches.map((match) => toMatchJSON(match)), next },
        record: {
          moments: page.matches.map((match) => ({
            momentID: match.row.moment_id,
            version: match.row.version,
          })),
          next,
        },
      };
    },
  };
}

function toMatchJSON(match: MomentMatch): JSONObject {
  return {
    momentID: match.row.short_id,
    version: match.row.version,
    title: match.title,
    keptAt: new Date(match.row.kept_at).toISOString(),
    state: match.row.state,
  };
}
