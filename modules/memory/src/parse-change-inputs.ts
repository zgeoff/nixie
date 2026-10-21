import { z } from 'zod';
import type { VersionRef } from './types';

const inputsColumn = z.array(z.strictObject({ itemID: z.string(), version: z.int().min(1) }));

export function parseChangeInputs(column: string): readonly VersionRef[] {
  return inputsColumn.parse(JSON.parse(column));
}
