import { ORPCError } from '@orpc/client';

export function isImageForgottenError(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'IMAGE_FORGOTTEN';
}
