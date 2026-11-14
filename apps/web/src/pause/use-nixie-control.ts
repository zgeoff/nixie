import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNixieClient } from '../utils/use-nixie-client';

export type NixieControl = 'pause' | 'resume';

export interface NixieControlHandle {
  readonly isError: boolean;
  readonly isPending: boolean;

  readonly onSend: () => void;
}

export function useNixieControl(control: NixieControl): NixieControlHandle {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [clientActionID, setClientActionID] = useState<string | null>(null);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.nixie.key() });
    void queryClient.invalidateQueries({ queryKey: nixie.queryUtils.tasks.key() });
  };

  const sent = useMutation({
    mutationFn: (actionID: string) =>
      control === 'pause'
        ? nixie.client.nixie.pause({ clientActionID: actionID })
        : nixie.client.nixie.resume({ clientActionID: actionID }),
    onError: refresh,
    onSuccess: () => {
      setClientActionID(null);
      refresh();
    },
  });

  // A control that failed goes again under the same client action ID, so a retry applies it once.
  const onSend = (): void => {
    const actionID = clientActionID ?? crypto.randomUUID();

    setClientActionID(actionID);

    sent.mutate(actionID);
  };

  return { isError: sent.isError, isPending: sent.isPending, onSend };
}
