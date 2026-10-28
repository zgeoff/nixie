import { use, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { NoteOfferStorageContext } from './note-offer-storage-context';

export interface NoteOffer {
  readonly isOpen: boolean;
  readonly notice: string | null;

  readonly close: () => void;
}

const keptCount = 500;

// The keep notice offers a note once, so the answer lives on the device and outlives a reload. A
// server render has no device storage, so it shows no offer.
export function useNoteOffer(momentID: string): NoteOffer {
  const storage = use(NoteOfferStorageContext);

  const stored = useSyncExternalStore(
    storage.subscribe,
    () => storage.read() ?? '[]',
    () => null,
  );

  const [isClosed, setIsClosed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isAnswered = stored === null || parseAnswered(stored).includes(momentID);

  return {
    isOpen: !isClosed && !isAnswered,
    notice,
    close: () => {
      setIsClosed(true);

      try {
        const answered = parseAnswered(storage.read() ?? '[]').filter(
          (answer) => answer !== momentID,
        );

        storage.write(JSON.stringify([...answered, momentID].slice(-keptCount)));
      } catch {
        // A browser refuses the write when its storage is full or blocked for the site.
        setNotice('This device could not keep your answer, so it may offer a note again.');
      }
    },
  };
}

function parseAnswered(text: string): readonly string[] {
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
