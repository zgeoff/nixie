import type { Window } from 'happy-dom';

// Stands in for the system's light or dark setting. happy-dom answers prefers-color-scheme from its
// device settings, and tells a media query's listeners about a change only on a resize, so this
// raises one after the change. The test preload returns the setting to light after each test.
export function updateSystemColorScheme(scheme: 'dark' | 'light'): void {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preload registered happy-dom's window
  const window = globalThis as unknown as Window;

  window.happyDOM.settings.device.prefersColorScheme = scheme;

  window.dispatchEvent(new window.Event('resize'));
}
