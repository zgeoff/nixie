import { isTimeZone } from '@heynixie/contract';

export function pickMessageZone(zone: unknown, defaultZone: string): string {
  return typeof zone === 'string' && isTimeZone(zone) ? zone : defaultZone;
}
