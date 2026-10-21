import { oc } from '@orpc/contract';

export const signedIn = oc.errors({
  UNAUTHORIZED: { message: 'The device session is missing, lapsed or revoked', status: 401 },
});
