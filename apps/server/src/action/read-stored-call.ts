import type { ConsentCheck, DecisionInputs, JSONObject, Log } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA, readRecords } from '@heynixie/log';
import type { CallDestination } from '@heynixie/policy';
import { toolCalledCodec } from '@heynixie/tools';
import { z } from 'zod';

// What a tool_called record holds that the decision point reads again.
export interface StoredCall {
  readonly callID: string;
  readonly thread: string | null;
  readonly tool: string;
  readonly input: JSONObject;
  readonly destinations: readonly CallDestination[];
  readonly inputs: DecisionInputs;

  // the consent answer the call recorded, because the consent checker is a model
  readonly consentCheck: ConsentCheck | null;
}

const erasableSchema = z.object({
  input: JSON_OBJECT_SCHEMA,
  destinations: z.object({ value: z.string(), replyTarget: z.boolean() }).array().default([]),
});

// Null for a record that cannot be decided again: one from before the full decision point holds no
// inputs, and a forget shreds the input and the destinations.
export async function readStoredCall(log: Log, sequence: number): Promise<StoredCall | null> {
  const [entry] = await readRecords(log, { afterSequence: sequence - 1, limit: 1 });

  const record = entry?.record;
  const inputs = record?.decision?.inputs;

  if (
    record === undefined ||
    record.kind !== 'tool_called' ||
    inputs === undefined ||
    record.erasable.status !== 'readable'
  ) {
    return null;
  }

  const erasable = erasableSchema.parse(record.erasable.fields);
  const called = toolCalledCodec.decode(record.payload);

  return {
    callID: called.callID,
    thread: record.thread,
    tool: called.tool,
    input: erasable.input,
    destinations: erasable.destinations,
    inputs,
    consentCheck: record.decision?.consentCheck ?? null,
  };
}
