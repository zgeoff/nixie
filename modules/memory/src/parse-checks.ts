import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

const checksColumn = z.record(z.string(), z.json());

export function parseChecks(column: string): JSONObject {
  return checksColumn.parse(JSON.parse(column));
}
