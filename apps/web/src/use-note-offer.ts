import { useState, useSyncExternalStore } from 'react';
import { z } from 'zod';

export interface NoteOffer {
  readonly isOpen: boolean;

  readonly close: () => void;
}

const storageKey = 'nixie.momentNoteOffers';
const keptCount = 500;

// The keep notice offers a note once, so the answer lives on the device and outlives a reload. A
// server render has no device storage, so it shows no offer.
export function useNoteOffer(momentID: string): NoteOffer {
  const stored = useSyncExternalStore(subscribeToStorage, readStoredOffers, () => null);
  const [isClosed, setIsClosed] = useState(false);
  const isAnswered = stored === null || parseAnswered(stored).includes(momentID);

  return {
    isOpen: !isClosed && !isAnswered,
    close: () => {
      const answered = parseAnswered(readStoredOffers()).filter((answer) => answer !== momentID);

      globalThis.localStorage.setItem(
        storageKey,
        JSON.stringify([...answered, momentID].slice(-keptCount)),
      );

      setIsClosed(true);
    },
  };
}

function subscribeToStorage(onChange: () => void): () => void {
  globalThis.addEventListener('storage', onChange);

  return () => {
    globalThis.removeEventListener('storage', onChange);
  };
}

function readStoredOffers(): string {
  return globalThis.localStorage.getItem(storageKey) ?? '[]';
}

function parseAnswered(text: string): readonly string[] {
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
