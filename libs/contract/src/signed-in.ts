import { oc } from '@orpc/contract';

// Every procedure except enrol needs a device session, from the cookie or a bearer token.
export const signedIn = oc.errors({
  UNAUTHORIZED: { message: 'The device session is missing, lapsed or revoked', status: 401 },
});
