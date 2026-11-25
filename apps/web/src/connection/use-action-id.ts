import { useState } from 'react';

export interface ActionID {
  readonly id: string;

  // takes a new ID once an action finished, so the next action is not read as a retry of it
  readonly renew: () => void;
}

// A checked action keeps its first result for its ID, so a retry of a failed call reuses the ID.
export function useActionID(): ActionID {
  const [id, setID] = useState(() => crypto.randomUUID());

  return {
    id,
    renew: () => {
      setID(crypto.randomUUID());
    },
  };
}
