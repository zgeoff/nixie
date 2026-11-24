import { WringerError } from '@wringer/core';

export function throwRefusal(refusal: string | null, data: unknown): void {
  if (refusal !== null) {
    throw new WringerError('check-failed', { message: refusal, data });
  }
}
