import type { ContractClient, PageData } from '@heynixie/contract';
import { useRef } from 'react';
import { useNixieClient } from '../utils/use-nixie-client';
import { canSendEvent } from './can-send-event';

export interface PageEventSend {
  readonly region: string;
  readonly shown: string;
  readonly name: string;
  readonly data: PageData | undefined;
  readonly wake: boolean;
}

// Sends an event that a page raised to the server, unless its region already sent too many. An
// event that fails to send is lost, as the server answers STALE for content that is gone.
export function useSendPageEvent(): (send: PageEventSend) => void {
  const nixie = useNixieClient();
  const sent = useRef(new Map<string, number[]>());

  return (send) => {
    const nowMs = Date.now();
    const earlier = sent.current.get(send.region) ?? [];

    if (!canSendEvent(earlier, nowMs)) {
      return;
    }

    sent.current.set(send.region, [...earlier.filter((atMs) => nowMs - atMs < 60_000), nowMs]);
    void sendEvent(nixie.client, send);
  };
}

async function sendEvent(client: ContractClient, send: PageEventSend): Promise<void> {
  try {
    await client.devices.pageEvent({
      region: send.region,
      shown: send.shown,
      name: send.name,
      wake: send.wake,
      ...(send.data === undefined ? {} : { data: send.data }),
    });
  } catch {
    // the event is lost, and the page sends the next one
  }
}
