import { ORPCError } from '@orpc/client';
import { useState } from 'react';

export interface ActionID {
  readonly id: string;

  // takes a new ID once nixie answered the action, with a result or a refusal, so the next action
  // is not read as a retry of it. A call that got no answer keeps its ID, because it may have run.
  readonly settle: (error: unknown) => void;
}

// A checked action keeps its first result for its ID, so a retry of a call that got no answer reuses the ID.
export function useActionID(): ActionID {
  const [id, setID] = useState(() => crypto.randomUUID());

  return {
    id,
    settle: (error) => {
      if (error === null || error instanceof ORPCError) {
        setID(crypto.randomUUID());
      }
    },
  };
}
