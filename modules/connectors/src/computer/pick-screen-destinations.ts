import type { ScreenBinding } from '@heynixie/wire';

// A browser tab's host is the destination, and any other window has none.
export function pickScreenDestinations(binding: ScreenBinding): string[] {
  return binding.kind === 'browser' && binding.url !== undefined ? [new URL(binding.url).host] : [];
}
