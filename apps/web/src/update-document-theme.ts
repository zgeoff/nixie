// Sets the document's theme to the device's stored choice, or to the system setting when the
// device stores none. The document's head runs this function's own source as an inline script
// before the first paint, so it reads nothing from outside its body: no import and no outer name.
export function updateDocumentTheme(storageKey: string): void {
  const choice = globalThis.localStorage.getItem(storageKey);
  const isDark =
    choice === 'dark' ||
    (choice !== 'light' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);

  globalThis.document.documentElement.dataset['theme'] = isDark ? 'dark' : 'light';
}
