import { isTimeZone } from '@heynixie/contract';

// The zone a message's times show in: the one it was sent from, or the default zone when the message
// names none or one this runtime does not know.
export function pickMessageZone(zone: unknown, defaultZone: string): string {
  return typeof zone === 'string' && isTimeZone(zone) ? zone : defaultZone;
}
