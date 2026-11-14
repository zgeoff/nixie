import { createContext } from 'react';

export interface NoteOfferStorage {
  readonly read: () => string | null;
  readonly write: (text: string) => void;
  readonly subscribe: (onChange: () => void) => () => void;
}

const storageKey = 'nixie.momentNoteOffers';

const browserNoteOfferStorage: NoteOfferStorage = {
  read: () => globalThis.localStorage.getItem(storageKey),
  write: (text) => {
    globalThis.localStorage.setItem(storageKey, text);
  },
  subscribe: subscribeToBrowserStorage,
};

export const NoteOfferStorageContext = createContext<NoteOfferStorage>(browserNoteOfferStorage);

function subscribeToBrowserStorage(onChange: () => void): () => void {
  globalThis.addEventListener('storage', onChange);

  return () => {
    globalThis.removeEventListener('storage', onChange);
  };
}
