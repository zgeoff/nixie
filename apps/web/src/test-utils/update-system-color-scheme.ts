// Stands in for the system's light or dark setting. happy-dom answers prefers-color-scheme from its
// device settings, and tells a media query's listeners about a change only on a resize, so this
// raises one after the change. The test preload returns the setting to light after each test.
export function updateSystemColorScheme(scheme: 'dark' | 'light'): void {
  globalThis.happyDOM.settings.device.prefersColorScheme = scheme;

  globalThis.dispatchEvent(new Event('resize'));
}
