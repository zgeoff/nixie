// The document's head runs this function's source as an inline script, so the body reads nothing
// from outside itself: no import and no outer name.
export function updateDocumentTheme(storageKey: string): void {
  const choice = globalThis.localStorage.getItem(storageKey);

  const isDark =
    choice === 'dark' ||
    (choice !== 'light' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);

  globalThis.document.documentElement.dataset['theme'] = isDark ? 'dark' : 'light';
}
