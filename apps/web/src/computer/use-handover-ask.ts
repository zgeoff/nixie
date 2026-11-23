import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { subscribeToLiveRecords } from '../conversation/subscribe-to-live-records';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import type { HandoverAsk } from './pick-handover-ask';
import { pickHandoverAsk } from './pick-handover-ask';

// The read is a safety net for a record the stream could miss; the stream is what shows an ask and
// clears it.
const handoverRefetchMs = 60_000;

// The assistant's standing ask for a take-over. One read gives the ask and the log sequence it saw,
// and the live stream from that sequence opens and clears it, so a client that opens late shows an
// ask that stands, and every client clears it when a take-over starts or the ask closes.
export function useHandoverAsk(): HandoverAsk | null {
  const nixie = useNixieClient();
  const client = nixie.client;

  const read = useQuery({
    ...nixie.queryUtils.computer.readHandover.queryOptions(),
    refetchInterval: handoverRefetchMs,
    refetchOnWindowFocus: 'always',
  });

  const [streamed, setStreamed] = useState<{ readonly ask: HandoverAsk | null } | null>(null);
  const afterSequence = read.data?.readAtSequence;
  const readAsk = read.data?.ask;

  useEffect(() => {
    setStreamed(null);

    if (afterSequence === undefined) {
      return;
    }

    const following = new AbortController();

    const current = {
      ask: readAsk === undefined || readAsk === null ? null : { reason: readAsk.reason },
    };

    void subscribeToLiveRecords({
      afterSequence,
      client,
      onAvailability: () => {},
      onRecord: (record) => {
        const next = pickHandoverAsk(current.ask, record);

        if (next !== current.ask) {
          current.ask = next;

          setStreamed({ ask: next });
        }
      },
      signal: following.signal,
      startTimer: startPlatformTimer,
    });

    return () => {
      following.abort();
    };
  }, [afterSequence, readAsk, client]);

  if (streamed !== null) {
    return streamed.ask;
  }

  return readAsk === undefined || readAsk === null ? null : { reason: readAsk.reason };
}
