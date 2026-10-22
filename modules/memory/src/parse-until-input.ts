import { z } from 'zod';

export type ParsedUntil =
  | { readonly status: 'valid'; readonly until?: number | null }
  | { readonly status: 'invalid'; readonly message: string };

const untilSchema = z.iso.datetime({ offset: true });

export function parseUntilInput(value: string | null | undefined): ParsedUntil {
  if (value === undefined) {
    return { status: 'valid' };
  }

  if (value === null) {
    return { status: 'valid', until: null };
  }

  const parsed = untilSchema.safeParse(value);

  return parsed.success
    ? { status: 'valid', until: Date.parse(parsed.data) }
    : {
        status: 'invalid',
        message: `until ${value} is not a real ISO time with an offset, such as 2026-10-19T23:59:59+01:00`,
      };
}
