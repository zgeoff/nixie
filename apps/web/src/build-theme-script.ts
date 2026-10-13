import { themeStorageKey } from './theme-storage-key';
import { updateDocumentTheme } from './update-document-theme';

// The document head's inline script: it sets the theme before the first paint, so a dark page
// never flashes light.
export function buildThemeScript(): string {
  return `(${updateDocumentTheme.toString()})(${JSON.stringify(themeStorageKey)})`;
}
