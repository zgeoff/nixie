import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

const checksColumn = z.record(z.string(), z.json());

// A version's checks column as the verdict of each write check, by check.
export function parseChecks(column: string): JSONObject {
  return checksColumn.parse(JSON.parse(column));
}
