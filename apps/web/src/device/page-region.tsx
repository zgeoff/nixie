import type { ContractClient } from '@heynixie/contract';
import { devicePagePaths } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { parseFrameMessage } from './parse-frame-message';
import type { PageDataNotice, PageDelivery } from './use-device-events';
import { useSendPageEvent } from './use-send-page-event';

export interface PageRegionProps {
  readonly region: string;

  // the short ID of the content the frame shows
  readonly shown: string;

  // the ticket that the frame's path ends with
  readonly frame: string;

  // each message that the assistant sent since the stream opened, oldest first
  readonly messages: readonly PageDelivery[];

  // each refresh of a declared fetch since the stream opened
  readonly notices: readonly PageDataNotice[];
  readonly onFail: (message: string) => void;

  // called when the page's frame sees a touch or a pointer move, which never reaches this page
  readonly onTouch: (() => void) | undefined;
}

const frameStyle = css({ border: '0', display: 'block', height: '100%', width: '100%' });

// A page in a sealed frame: `allow-scripts` and nothing else, so its origin is opaque. Each time the
// frame loads it gets the retained message, then each message it has not seen. The device hears the
// page only through postMessage from this frame's own window.
export function PageRegion(props: PageRegionProps): ReactNode {
  const frame = useRef<HTMLIFrameElement>(null);
  const [readyCount, setReadyCount] = useState(0);
  const delivered = useRef({ messageID: 0, readyCount: 0 });
  const sendEvent = useSendPageEvent();
  const nixie = useNixieClient();
  const heardNotice = useRef(0);
  const client = nixie.client;
  const region = props.region;
  const shown = props.shown;
  const onFail = props.onFail;
  const onTouch = props.onTouch;

  // a layout effect, so the listener is in place before the frame's first script can post
  useLayoutEffect(() => {
    const listen = (event: MessageEvent): void => {
      if (event.source === null || event.source !== frame.current?.contentWindow) {
        return;
      }

      const parsed = parseFrameMessage(event.data);

      if (parsed.status === 'refused') {
        onFail(parsed.reason);
      }

      if (parsed.status !== 'message') {
        return;
      }

      const message = parsed.message;

      if (message.type === 'ready') {
        setReadyCount((count) => count + 1);
      } else if (message.type === 'touch') {
        onTouch?.();
      } else if (message.type === 'data') {
        void answerData(client, frame.current?.contentWindow, { region, shown, ...message });
      } else if (message.type === 'error') {
        onFail(message.message);
      } else {
        sendEvent({ region, shown, name: message.name, data: message.data, wake: message.wake });
      }
    };

    window.addEventListener('message', listen);

    return () => {
      window.removeEventListener('message', listen);
    };
  }, [region, shown, onFail, onTouch, sendEvent, client]);

  useEffect(() => {
    const target = frame.current?.contentWindow;

    if (readyCount === 0 || target === null || target === undefined) {
      return;
    }

    const mine = props.messages.filter(
      (message) => message.region === region && message.shown === shown,
    );

    const retained =
      delivered.current.readyCount === readyCount
        ? undefined
        : mine.findLast((message) => message.retain);

    const waiting = mine.filter(
      (message) => message.id > delivered.current.messageID && message !== retained,
    );

    for (const message of retained === undefined ? waiting : [retained, ...waiting]) {
      target.postMessage({ nixie: true, type: 'message', data: message.data }, '*');
    }

    delivered.current = { messageID: mine.at(-1)?.id ?? delivered.current.messageID, readyCount };
  }, [readyCount, props.messages, region, shown]);

  useEffect(() => {
    const target = frame.current?.contentWindow;

    if (readyCount === 0 || target === null || target === undefined) {
      return;
    }

    for (const notice of props.notices) {
      if (notice.id > heardNotice.current && notice.region === region && notice.shown === shown) {
        target.postMessage({ nixie: true, type: 'data-changed', url: notice.url }, '*');
      }
    }

    heardNotice.current = props.notices.at(-1)?.id ?? heardNotice.current;
  }, [readyCount, props.notices, region, shown]);

  return (
    <iframe
      className={frameStyle}
      data-testid={`page-${region}`}
      ref={frame}
      referrerPolicy="no-referrer"
      sandbox="allow-scripts"
      src={`${devicePagePaths.frames}${props.frame}`}
      title={`Page ${region}`}
    />
  );
}

interface DataAsk {
  readonly region: string;
  readonly shown: string;
  readonly id: number;
  readonly url: string;
}

// Answers a page's nixie.data from the server's last response of the fetch the page declared. The
// frame has no network, so the device page makes the call, and the reply goes back by postMessage
// with the code of the refusal when there is none.
async function answerData(
  client: ContractClient,
  target: Window | null | undefined,
  ask: DataAsk,
): Promise<void> {
  const reply = await readData(client, ask);

  target?.postMessage({ nixie: true, type: 'data-result', id: ask.id, ...reply }, '*');
}

async function readData(
  client: ContractClient,
  ask: DataAsk,
): Promise<{ ok: true; value: unknown } | { ok: false; code: string }> {
  try {
    return {
      ok: true,
      value: await client.devices.pageData({ region: ask.region, shown: ask.shown, url: ask.url }),
    };
  } catch (error) {
    return { ok: false, code: error instanceof ORPCError ? error.code : 'REFUSED' };
  }
}
