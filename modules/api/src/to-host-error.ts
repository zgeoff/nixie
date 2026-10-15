import { ORPCError } from '@orpc/server';

interface HostErrorOptions {
  readonly message: string;
  readonly cause: unknown;
}

type HostErrors = Readonly<
  Record<string, (options: HostErrorOptions) => ORPCError<string, unknown>>
>;

// Turns an error a host procedure threw into the typed error the host contract declares for its
// code, such as a stale version's STALE_VERSION, or into a 500 that keeps the error's reason. An
// oRPC error passes through as it is.
export function toHostError(error: unknown, errors: HostErrors): ORPCError<string, unknown> {
  if (error instanceof ORPCError) {
    // the class narrows to its any-typed form, and every oRPC error has a string code
    return error as ORPCError<string, unknown>;
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error ? error.code : null;
  const buildError = typeof code === 'string' && Object.hasOwn(errors, code) ? errors[code] : null;

  return buildError === null || buildError === undefined
    ? new ORPCError('INTERNAL_SERVER_ERROR', { message, cause: error })
    : buildError({ message, cause: error });
}
