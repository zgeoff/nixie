import { expect, test } from 'bun:test';
import { formatForgetStatus } from './format-forget-status';

test.each([
  ['done', 'confirmed', 'Erasure: done.', 'Revocation: confirmed.'],
  ['pending', 'pending', 'Erasure: pending.', 'Revocation: pending.'],
  ['done', 'refused', 'Erasure: done.', 'Revocation: refused.'],
  ['done', 'unknown', 'Erasure: done.', 'Revocation: unknown.'],
  ['done', 'not_attempted', 'Erasure: done.', 'Revocation: not attempted.'],
] as const)(
  '#formatForgetStatus words erasure %s and revocation %s apart',
  (erasure, revocation, erasureStart, revocationStart) => {
    const lines = formatForgetStatus({ erasure, revocation });

    expect([
      lines.erasure.startsWith(erasureStart),
      lines.revocation.startsWith(revocationStart),
    ]).toStrictEqual([true, true]);
  },
);
