export function toLoggedReason(reason: string): string {
  return reason.replaceAll(/\?\S*/gu, '?[removed]');
}
