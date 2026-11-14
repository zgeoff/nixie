import type { ExecStream, Sandbox, SandboxAdapter } from '@heynixie/sandbox';
import { decodeFetchGuestFrame, encodeFetchMessage } from '@heynixie/wire';

const hopPassMessage = encodeFetchMessage({ kind: 'hop-pass' });

// Wraps the adapter so each stream a sandbox spawns reports the time from each hop frame the guest
// sends to the host's answer to it: the hop-pass that lets the fetch go on, or the stop that
// refuses it. The server scans the hop between the two, so the interval is the cost of the hop.
export function timeHopExchange(
  adapter: SandboxAdapter,
  report: (line: string) => void,
): SandboxAdapter {
  const timeStream = (stream: ExecStream): ExecStream => {
    const frames: { count: number; pendingAtMs: number[] } = { count: 0, pendingAtMs: [] };

    const reportAnswer = (answer: string) => {
      const frameAtMs = frames.pendingAtMs.shift();

      if (frameAtMs !== undefined) {
        report(
          `hop ${String(frames.count)} ${answer} ${String(performance.now() - frameAtMs)} ms after its frame`,
        );
      }
    };

    return {
      ...stream,
      messages: tapHopFrames(stream.messages, () => {
        frames.count += 1;

        frames.pendingAtMs.push(performance.now());
      }),
      send: async (message) => {
        await stream.send(message);

        if (Buffer.from(message).equals(hopPassMessage)) {
          reportAnswer('passed');
        }
      },
      stop: () => {
        reportAnswer('refused');

        return stream.stop();
      },
    };
  };

  const timeSandbox = (sandbox: Sandbox): Sandbox => ({
    ...sandbox,
    get isRetired() {
      return sandbox.isRetired;
    },
    spawn: async (...args) => {
      const stream = await sandbox.spawn(...args);

      return timeStream(stream);
    },
  });

  return {
    ...adapter,
    create: async (spec) => {
      const sandbox = await adapter.create(spec);

      return timeSandbox(sandbox);
    },
  };
}

async function* tapHopFrames(
  messages: ExecStream['messages'],
  onHop: () => void,
): ExecStream['messages'] {
  for await (const message of messages) {
    if (decodeFetchGuestFrame(message).kind === 'hop') {
      onHop();
    }

    yield message;
  }
}
