import type { JSONObject } from '@heynixie/log';
import type { RegisteredTool } from '../types';

// A tool that reads the facts of its call first reads them again when the action runs. Destinations
// that differ from the ones the owner approved settle the action as changed, and nothing runs.
export async function probePreparedAsApproved(
  registered: RegisteredTool,
  input: JSONObject,
  approved: readonly string[],
): Promise<boolean> {
  const prepare = registered.definition.prepare;

  if (prepare === undefined) {
    return true;
  }

  const prepared = await prepare(input);

  if (!('destinations' in prepared)) {
    return true;
  }

  const now = prepared.destinations.map((value) => value.normalize('NFC'));

  return now.length === approved.length && now.every((value, index) => value === approved[index]);
}
