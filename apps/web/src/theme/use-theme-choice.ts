import { useEffect, useSyncExternalStore } from 'react';
import { themeStorageKey } from './theme-storage-key';
import { updateDocumentTheme } from './update-document-theme';

export type ThemeChoice = 'dark' | 'light' | 'system';

export interface ThemeChoiceState {
  readonly choice: ThemeChoice;
  readonly setChoice: (choice: ThemeChoice) => void;
}

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

function writeThemeChoice(choice: ThemeChoice): void {
  if (choice === 'system') {
    globalThis.localStorage.removeItem(themeStorageKey);
  } else {
    globalThis.localStorage.setItem(themeStorageKey, choice);
  }

  globalThis.dispatchEvent(new Event(changeEvent));
}
