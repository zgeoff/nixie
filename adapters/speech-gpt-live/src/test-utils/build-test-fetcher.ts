import type { GPTLiveFetcher, SidebandInit, SidebandSocket } from '../types';

// Stands in for the credential store's fetcher against a local site that signs with `ca`. It adds
// no credential, so a test sees what the adapter itself sends.
export function buildTestFetcher(ca: string): GPTLiveFetcher {
  const send = (input: string, init?: RequestInit) => fetch(input, { ...init, tls: { ca } });
  const openSocket = (url: string, init?: SidebandInit) => openTestSocket(url, ca, init?.signal);

  return Object.assign(send, { openSocket });
}

function openTestSocket(
  url: string,
  ca: string,
  signal: AbortSignal | undefined,
): Promise<SidebandSocket> {
  const opening = Promise.withResolvers<SidebandSocket>();

  const socket = new WebSocket(url, { tls: { ca } });

  const texts: string[] = [];
  const waiters: ((text: string | null) => void)[] = [];
  let isEnded = false;

  const end = (): void => {
    isEnded = true;

    for (const waiter of waiters.splice(0)) {
      waiter(null);
    }
  };

  socket.addEventListener('message', (message) => {
    const text = String(message.data);
    const waiter = waiters.shift();

    if (waiter === undefined) {
      texts.push(text);
    } else {
      waiter(text);
    }
  });

  socket.addEventListener('close', end);

  socket.addEventListener('error', () => {
    opening.reject(new Error('the socket did not open'));
  });

  signal?.addEventListener('abort', () => {
    socket.close();
    opening.reject(new Error('the open was aborted'));
  });

  socket.addEventListener('open', () => {
    opening.resolve({
      send: (text) => {
        socket.send(text);
      },
      close: () => {
        socket.close();
      },
      messages: streamTexts({ texts, waiters, isEnded: () => isEnded }),
    });
  });

  return opening.promise;
}

interface TextInbox {
  readonly texts: string[];
  readonly waiters: ((text: string | null) => void)[];
  readonly isEnded: () => boolean;
}

async function* streamTexts(inbox: TextInbox): AsyncGenerator<string> {
  for (;;) {
    const queued = inbox.texts.shift();

    if (queued !== undefined) {
      yield queued;
      continue;
    }

    if (inbox.isEnded()) {
      return;
    }

    const next = await new Promise<string | null>((resolve) => {
      inbox.waiters.push(resolve);
    });

    if (next === null) {
      return;
    }

    yield next;
  }
}
