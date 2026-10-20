import { useEffect, useSyncExternalStore } from 'react';
import { themeStorageKey } from './theme-storage-key';
import { updateDocumentTheme } from './update-document-theme';

export type ThemeChoice = 'dark' | 'light' | 'system';

export interface ThemeChoiceState {
  readonly choice: ThemeChoice;
  readonly setChoice: (choice: ThemeChoice) => void;
}

// The device's theme choice, kept in device storage. While it is the system's, the theme follows
// the system setting as it changes. The server knows no device storage, so the first render is the
// system's choice and hydration then reads the stored one.
export function useThemeChoice(): ThemeChoiceState {
  const choice = useSyncExternalStore<ThemeChoice>(
    subscribeToThemeChoice,
    readThemeChoice,
    () => 'system',
  );

  useEffect(() => {
    const query = globalThis.matchMedia('(prefers-color-scheme: dark)');

    const update = (): void => {
      updateDocumentTheme(themeStorageKey);
    };

    update();

    query.addEventListener('change', update);

    return () => {
      query.removeEventListener('change', update);
    };
  }, [choice]);

  return { choice, setChoice: writeThemeChoice };
}

// A storage event reaches only the other tabs, so this tab announces its own writes with this one.
const changeEvent = 'nixie:theme-change';

function subscribeToThemeChoice(onChange: () => void): () => void {
  globalThis.addEventListener('storage', onChange);
  globalThis.addEventListener(changeEvent, onChange);

  return () => {
    globalThis.removeEventListener('storage', onChange);
    globalThis.removeEventListener(changeEvent, onChange);
  };
}

function readThemeChoice(): ThemeChoice {
  const stored = globalThis.localStorage.getItem(themeStorageKey);

  return stored === 'dark' || stored === 'light' ? stored : 'system';
}

// The system's choice stores nothing, so the device holds a value only for an override.
function writeThemeChoice(choice: ThemeChoice): void {
  if (choice === 'system') {
    globalThis.localStorage.removeItem(themeStorageKey);
  } else {
    globalThis.localStorage.setItem(themeStorageKey, choice);
  }

  globalThis.dispatchEvent(new Event(changeEvent));
}
