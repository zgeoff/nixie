import { devicePagePaths } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { parseFrameMessage } from './parse-frame-message';
import type { PageDelivery } from './use-device-events';
import { useSendPageEvent } from './use-send-page-event';

export interface PageRegionProps {
  readonly region: string;

  // the short ID of the content the frame shows
  readonly shown: string;

  // the ticket that the frame's path ends with
  readonly frame: string;

  // each message that the assistant sent since the stream opened, oldest first
  readonly messages: readonly PageDelivery[];
  readonly onFail: (message: string) => void;
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
  const region = props.region;
  const shown = props.shown;
  const onFail = props.onFail;

  useEffect(() => {
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
  }, [region, shown, onFail, sendEvent]);

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

  return (
    <iframe
      className={frameStyle}
      data-testid={`page-${region}`}
      referrerPolicy="no-referrer"
      sandbox="allow-scripts"
      src={`${devicePagePaths.frames}${props.frame}`}
      title={`Page ${region}`}
    />
  );
}
