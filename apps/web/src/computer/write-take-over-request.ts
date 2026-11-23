import { takeOverRequestKey } from './constants';

// Marks that the person pressed Take over on the handover banner, for the computer page that loads
// next. A URL cannot carry it, because a link or a refresh would then start a hold nobody asked for.
export function writeTakeOverRequest(): void {
  try {
    globalThis.sessionStorage.setItem(takeOverRequestKey, 'on');
  } catch {
    // without storage the computer page opens watching, and the person takes over there
  }
}
