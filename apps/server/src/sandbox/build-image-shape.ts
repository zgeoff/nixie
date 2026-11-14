import { z } from 'zod';

type Field<Value extends z.ZodType> = Value | z.ZodOptional<Value>;

// The zod schema of one output that has a field per image key. A product caller passes
// sandboxImageKeys, and a test passes a tuple of its own. The schema is strict, so it refuses a
// key outside the tuple.
export function buildImageShape<Key extends string, Value extends z.ZodType>(
  keys: readonly Key[],
  value: Value,
  presence: 'optional',
): z.ZodObject<Record<Key, z.ZodOptional<Value>>, z.core.$strict>;

export function buildImageShape<Key extends string, Value extends z.ZodType>(
  keys: readonly Key[],
  value: Value,
  presence: 'required',
): z.ZodObject<Record<Key, Value>, z.core.$strict>;

export function buildImageShape<Key extends string, Value extends z.ZodType>(
  keys: readonly Key[],
  value: Value,
  presence: 'optional' | 'required',
): z.ZodObject<Record<Key, Field<Value>>, z.core.$strict> {
  const field = presence === 'optional' ? value.optional() : value;
  const shape = Object.fromEntries(keys.map((key) => [key, field]));

  if (!hasEveryKey(shape, keys)) {
    throw new Error('the shape lacks a key');
  }

  return z.strictObject(shape);
}

function hasEveryKey<Key extends string, Item>(
  shape: Readonly<Record<string, Item>>,
  keys: readonly Key[],
): shape is Record<Key, Item> {
  return keys.every((key) => key in shape);
}
