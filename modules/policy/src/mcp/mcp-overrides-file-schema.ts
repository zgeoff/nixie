import { z } from 'zod';
import { effectNames } from '../utils/effect-names';

const argumentSchema = z.string().min(1);

const reconcileSchema = z.union([
  z.strictObject({ idempotencyKey: argumentSchema }),
  z.strictObject({ check: z.string().min(1) }),
]);

export const mcpToolOverrideSchema = z.strictObject({
  effects: z.array(z.enum(effectNames)).min(1),
  destinations: z.array(argumentSchema).default([]),
  amount: argumentSchema.nullable().default(null),

  // null keeps the default: every string argument counts as content
  content: z.array(argumentSchema).nullable().default(null),
  reconcile: reconcileSchema.nullable().default(null),
});

// The overrides of every server as a snapshot's form holds them
export const mcpOverridesFormSchema = z.record(
  z.string(),
  z.record(z.string(), mcpToolOverrideSchema),
);

export const mcpOverridesFileSchema = z.record(z.string().min(1), mcpToolOverrideSchema);
