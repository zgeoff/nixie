// happy-dom tells a media query's listeners about a change only on a resize, so this raises one
// after the change.
export function updateSystemColorScheme(scheme: 'dark' | 'light'): void {
  globalThis.happyDOM.settings.device.prefersColorScheme = scheme;

  globalThis.dispatchEvent(new Event('resize'));
}
