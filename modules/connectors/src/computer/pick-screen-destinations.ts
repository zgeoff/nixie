import type { ScreenBinding } from '@heynixie/wire';
import { findURLHost } from './find-url-host';

// A browser tab's host is the destination, and any other window has none.
export function pickScreenDestinations(binding: ScreenBinding): string[] {
  const host =
    binding.kind === 'browser' && binding.url !== undefined ? findURLHost(binding.url) : null;

  return host === null ? [] : [host];
}
