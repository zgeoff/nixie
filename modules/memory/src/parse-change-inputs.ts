import { z } from 'zod';
import type { VersionRef } from './types';

// Reads a consolidation change's inputs column: the item IDs and the versions the change read,
// first input first.
export function parseChangeInputs(column: string): readonly VersionRef[] {
  return inputsColumn.parse(JSON.parse(column));
}

const inputsColumn = z.array(z.strictObject({ itemID: z.string(), version: z.int().min(1) }));
