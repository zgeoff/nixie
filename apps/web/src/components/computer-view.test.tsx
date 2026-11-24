import { expect, onTestFinished, test } from 'bun:test';
import { network } from '@heynixie/mock-server';
import { fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import type { LoadViewer, StartViewer, ViewerEvents } from '../computer/types';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ComputerView } from './computer-view';

interface StartedViewer {
  readonly target: HTMLElement;
  readonly socket: WebSocket;
  readonly events: ViewerEvents;
  readonly state: { isStopped: boolean };
}

function setupTest() {
  const started: StartedViewer[] = [];
  const tickets: string[] = [];
  const inputs: boolean[] = [];
  const pastes: string[] = [];
  const copied: string[] = [];
  const clipboard = { isRefusing: false };

  const answerRequest = (request: Request, server: Bun.Server<undefined>) =>
    tickets.some((ticket) => request.url.endsWith(ticket)) && server.upgrade(request)
      ? undefined
      : new Response(null, { status: 400 });

  // a desktop that opens its socket and stays quiet, as a sandbox that is still waking does
  const desktop = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: answerRequest,
    websocket: { message: () => {} },
  });

  onTestFinished(async () => {
    await desktop.stop(true);
  });

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () =>
      HttpResponse.json({ json: { takenOverAt: 1_700_000_000_000 }, meta: [] }),
    ),
    http.post('https://nixie.test/rpc/computer/watch', () => {
      const ticket = crypto.randomUUID();

      tickets.push(ticket);

      return HttpResponse.json({
        json: { streamURL: `ws://127.0.0.1:${String(desktop.port)}/?ticket=${ticket}` },
        meta: [],
      });
    }),
  );

  const startViewer: StartViewer = (target, socket, events) => {
    const state = { isStopped: false };

    started.push({ target, socket, events, state });

    return {
      stop: () => {
        state.isStopped = true;
      },
      setInput: (isOn) => {
        inputs.push(isOn);
      },
      paste: (text) => {
        pastes.push(text);
      },
    };
  };

  const loadViewer: LoadViewer = () => Promise.resolve(startViewer);
  const earlier = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');

  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        copied.push(text);

        return clipboard.isRefusing
          ? Promise.reject(new DOMException('no gesture', 'NotAllowedError'))
          : Promise.resolve();
      },
    },
  });

  onTestFinished(() => {
    if (earlier === undefined) {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard');
    } else {
      Object.defineProperty(globalThis.navigator, 'clipboard', earlier);
    }
  });

  return { started, tickets, inputs, pastes, copied, clipboard, loadViewer };
}

test('it asks for a ticket and gives the viewer the socket that the API names', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  render(<ComputerView loadViewer={ctx.loadViewer} />);

  await waitFor(() => {
    expect(ctx.started).toHaveLength(1);
  });

  expect(ctx.started[0]?.socket.url).toEndWith(`/?ticket=${ctx.tickets[0]}`);
});

test('it draws the desktop into an element of its own', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await waitFor(() => {
    expect(ctx.started).toHaveLength(1);
  });

  expect(ctx.started[0]?.target).toBe(
    rendered.getByRole('img', { name: "The computer's desktop" }),
  );
});

test('it says the computer is waking while the socket is open and no desktop has come', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  const status = await rendered.findByText('The computer is waking.');

  expect(status).toBeVisible();
});

test('it says it is watching once the viewer has the desktop', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const status = await rendered.findByText(
    "Your input won't reach the computer until you take over.",
  );

  expect(status).toBeVisible();
});

test('it offers to watch again when the stream ends, with a new ticket', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();
  ctx.started[0]?.events.onDisconnect();

  const again = await rendered.findByRole('button', { name: 'Watch again' });

  await user.click(again);

  await waitFor(() => {
    expect(ctx.started).toHaveLength(2);
  });

  expect(ctx.started[1]?.socket.url).not.toBe(ctx.started[0]?.socket.url);
});

test('it says the computer cannot be watched when the stream ends before the desktop shows', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onDisconnect();

  const status = await rendered.findByText(/can’t be watched right now/u);

  expect(status).toBeVisible();
});

test('it says the computer cannot be watched when the API refuses the call', async () => {
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/watch', () =>
      HttpResponse.json(
        { json: { defined: false, code: 'UNAUTHORIZED', status: 401, message: 'no' }, meta: [] },
        { status: 401 },
      ),
    ),
  );

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  const status = await rendered.findByText(/can’t be watched right now/u);

  expect(status).toBeVisible();
  expect(ctx.started).toStrictEqual([]);
});

test('it stops the viewer and closes the socket when the page goes away', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  rendered.unmount();

  await waitFor(() => {
    expect(ctx.started[0]?.state.isStopped).toBe(true);
  });

  expect(ctx.started[0]?.socket.readyState).toBeOneOf([WebSocket.CLOSING, WebSocket.CLOSED]);
});

test('it takes the desktop over and lets the viewer send input until it hands back', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();
  const calls: string[] = [];

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () => {
      calls.push('takeOver');

      return HttpResponse.json({ json: { takenOverAt: 1_700_000_000_000 }, meta: [] });
    }),
    http.post('https://nixie.test/rpc/computer/handBack', () => {
      calls.push('handBack');

      return HttpResponse.json({ json: { durationSeconds: 5 }, meta: [] });
    }),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);

  const handBackButton = await rendered.findByRole('button', { name: 'Hand back' });

  await user.click(handBackButton);
  await rendered.findByText('The computer is waking.');

  expect([calls, ctx.inputs]).toStrictEqual([
    ['takeOver', 'handBack'],
    [false, true, false, false],
  ]);
});

test('it watches again with a new ticket after a hand-back, because the server ends the stream', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () =>
      HttpResponse.json({ json: { takenOverAt: 1_700_000_000_000 }, meta: [] }),
    ),
    http.post('https://nixie.test/rpc/computer/handBack', () =>
      HttpResponse.json({ json: { durationSeconds: 5 }, meta: [] }),
    ),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);

  const handBackButton = await rendered.findByRole('button', { name: 'Hand back' });

  await user.click(handBackButton);

  await waitFor(() => {
    expect(ctx.started).toHaveLength(2);
  });

  expect([
    ctx.started[0]?.state.isStopped,
    ctx.tickets.length,
    new Set(ctx.tickets).size,
  ]).toStrictEqual([true, 2, 2]);
});

test('it says that another device holds the computer and sends no input', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () =>
      HttpResponse.json(
        {
          json: { defined: true, code: 'HELD_ELSEWHERE', status: 409, message: 'held' },
          meta: [],
        },
        { status: 409 },
      ),
    ),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);

  const alert = await rendered.findByRole('alert');

  expect([alert.textContent, ctx.inputs.includes(true)]).toStrictEqual([
    'Another device holds the computer.',
    false,
  ]);
});

test('it stops the input and shows the hold over when the server ends the stream of the holder', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () =>
      HttpResponse.json({ json: { takenOverAt: 1_700_000_000_000 }, meta: [] }),
    ),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  ctx.started[0]?.events.onDisconnect();

  const alert = await rendered.findByRole('alert');

  // the viewer learns of the lost hold in an effect, which can run after the alert shows
  await waitFor(() => {
    expect(ctx.inputs.at(-1)).toBe(false);
  });

  expect([
    alert.textContent,
    rendered.queryByRole('button', { name: 'Hand back' }),
    ctx.inputs.at(-1),
  ]).toStrictEqual(['Your hold on the computer ended.', null, false]);
});

test('it shows the hold over when a hand-back finds that this device no longer holds it', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/takeOver', () =>
      HttpResponse.json({ json: { takenOverAt: 1_700_000_000_000 }, meta: [] }),
    ),
    http.post('https://nixie.test/rpc/computer/handBack', () =>
      HttpResponse.json(
        {
          json: { defined: true, code: 'NOT_TAKEN_OVER', status: 409, message: 'not held' },
          meta: [],
        },
        { status: 409 },
      ),
    ),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);

  const handBackButton = await rendered.findByRole('button', { name: 'Hand back' });

  await user.click(handBackButton);

  const alert = await rendered.findByRole('alert');

  await waitFor(() => {
    expect(ctx.inputs.at(-1)).toBe(false);
  });

  expect([alert.textContent, ctx.inputs.at(-1)]).toStrictEqual([
    'Your hold on the computer ended.',
    false,
  ]);
});

test('it hands text that the user pastes to the viewer while the user holds the desktop', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  fireEvent.paste(rendered.getByRole('img', { name: "The computer's desktop" }), {
    clipboardData: { getData: () => 'hunter2', types: ['text/plain'], files: [] },
  });

  expect(ctx.pastes).toStrictEqual(['hunter2']);
});

test('it hands no pasted text to the viewer while the user only watches', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  await rendered.findByRole('button', { name: 'Take over' });

  fireEvent.paste(rendered.getByRole('img', { name: "The computer's desktop" }), {
    clipboardData: { getData: () => 'hunter2', types: ['text/plain'], files: [] },
  });

  expect(ctx.pastes).toStrictEqual([]);
});

test('it writes text that the desktop copies to the clipboard of the user while the user holds the desktop', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  ctx.started[0]?.events.onCopy('order 4471');
  expect(ctx.copied).toStrictEqual(['order 4471']);
});

test('it never writes to the clipboard of the user while the user only watches', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  await rendered.findByRole('button', { name: 'Take over' });

  ctx.started[0]?.events.onCopy('order 4471');
  expect(ctx.copied).toStrictEqual([]);
});

test('it offers a button for text that the browser would not put on the clipboard, and copies it on a press', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  ctx.clipboard.isRefusing = true;
  ctx.started[0]?.events.onCopy('order 4471');

  const copyButton = await rendered.findByRole('button', { name: 'Copy it' });

  ctx.clipboard.isRefusing = false;

  await user.click(copyButton);

  await waitFor(() => {
    expect(rendered.queryByRole('button', { name: 'Copy it' })).toBeNull();
  });

  expect(ctx.copied).toStrictEqual(['order 4471', 'order 4471']);
});

test('it keeps the button while the browser still refuses the text', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  ctx.clipboard.isRefusing = true;
  ctx.started[0]?.events.onCopy('order 4471');

  const copyButton = await rendered.findByRole('button', { name: 'Copy it' });

  await user.click(copyButton);

  await waitFor(() => {
    expect(ctx.copied).toHaveLength(2);
  });

  expect(rendered.getByRole('button', { name: 'Copy it' })).toBeVisible();
});

test('it drops the uncopied text when the user hands the computer back', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  network.use(
    http.post('https://nixie.test/rpc/computer/handBack', () =>
      HttpResponse.json({ json: { durationSeconds: 5 }, meta: [] }),
    ),
  );

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);

  const handBackButton = await rendered.findByRole('button', { name: 'Hand back' });

  ctx.clipboard.isRefusing = true;
  ctx.started[0]?.events.onCopy('order 4471');

  await rendered.findByRole('button', { name: 'Copy it' });
  await user.click(handBackButton);

  await waitFor(() => {
    expect(rendered.queryByRole('button', { name: 'Copy it' })).toBeNull();
  });
});

test('it hands a paste of 2000 characters to the viewer', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  fireEvent.paste(rendered.getByRole('img', { name: "The computer's desktop" }), {
    clipboardData: { getData: () => 'é'.repeat(2000), types: ['text/plain'], files: [] },
  });

  expect(ctx.pastes).toStrictEqual(['é'.repeat(2000)]);
});

test('it hands a longer paste to no one and tells the user', async () => {
  const user = userEvent.setup();
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<ComputerView loadViewer={ctx.loadViewer} />);

  await rendered.findByText('The computer is waking.');

  ctx.started[0]?.events.onConnect();

  const takeOverButton = await rendered.findByRole('button', { name: 'Take over' });

  await user.click(takeOverButton);
  await rendered.findByRole('button', { name: 'Hand back' });

  fireEvent.paste(rendered.getByRole('img', { name: "The computer's desktop" }), {
    clipboardData: { getData: () => 'a'.repeat(2001), types: ['text/plain'], files: [] },
  });

  const alert = await rendered.findByRole('alert');

  expect([alert.textContent, ctx.pastes]).toStrictEqual([
    'That text is too long to paste. Paste up to 2000 characters at a time.',
    [],
  ]);
});
