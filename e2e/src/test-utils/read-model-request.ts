import { z } from 'zod';

const toolUseSchema = z.looseObject({
  type: z.literal('tool_use'),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const sincePattern =
  /previous run started at (?<from>[0-9T:.-]+Z)\. This run started at (?<to>[0-9T:.-]+Z)\./u;

export interface ModelRequestReader {
  // the 2 times of the since block, or null when the body holds none
  readonly sinceTimes: { from: string; to: string } | null;

  // the eventID of the first owner entry in a log.read result the body holds
  readonly ownerEventID: string | null;

  // the input of the first call of a tool the body holds
  readonly readToolUseInput: (name: string) => Record<string, unknown> | null;
}

// Reads what a test needs from a model request body, wherever the model API nests it.
export function readModelRequest(body: unknown): ModelRequestReader {
  const values = collectValues(body);
  const groups = sincePattern.exec(JSON.stringify(body))?.groups;

  return {
    sinceTimes:
      groups?.['from'] === undefined || groups['to'] === undefined
        ? null
        : { from: groups['from'], to: groups['to'] },
    ownerEventID: findOwnerEventID(values),
    readToolUseInput: (name) => {
      for (const value of values) {
        const parsed = toolUseSchema.safeParse(value);

        if (parsed.success && parsed.data.name === name) {
          return parsed.data.input;
        }
      }

      return null;
    },
  };
}

function collectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return [value, ...value.flatMap((item) => collectValues(item))];
  }

  if (typeof value === 'object' && value !== null) {
    return [value, ...Object.values(value).flatMap((item) => collectValues(item))];
  }

  return [value];
}

const logEntrySchema = z.looseObject({ eventID: z.string(), role: z.string() });
const logPageSchema = z.object({ entries: z.array(logEntrySchema) });

function findOwnerEventID(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const page = logPageSchema.safeParse(parseJSON(value));
    const owner = page.data?.entries.find((entry) => entry.role === 'owner');

    if (owner !== undefined) {
      return owner.eventID;
    }
  }

  return null;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
