import { themeStorageKey } from './theme-storage-key';
import { updateDocumentTheme } from './update-document-theme';

export function buildThemeScript(): string {
  return `(${updateDocumentTheme.toString()})(${JSON.stringify(themeStorageKey)})`;
}
