import { z } from 'zod';
import { passkeyFailureSchema } from './passkey-failure-schema';

export const passkeyFailedError = {
  PASSKEY_FAILED: {
    message: 'The passkey check failed',
    status: 403,
    data: z.object({ reason: passkeyFailureSchema }),
  },
};
