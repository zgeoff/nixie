// A local proxy between the CLI and the model API. The CLI's base URL points here, each request goes
// on to the API, and the proxy keeps what the request asked for and what the response streamed back,
// so a run can set what the API sent beside what reached the SDK's caller.

export interface CapturedBlock {
  readonly type: string;
  readonly textBytes: number;
  readonly signatureBytes: number;
  readonly dataBytes: number;
  readonly text: string;
}

export interface CapturedCall {
  readonly model: string;
  readonly thinking: unknown;
  readonly outputConfig: unknown;
  readonly status: number;
  readonly blocks: CapturedBlock[];

  // how many of each stream event and delta type the response held, such as content_block_delta/thinking_delta
  readonly events: Record<string, number>;
  usage: Record<string, unknown> | null;
}

export interface CaptureProxy {
  readonly url: string;
  readonly calls: CapturedCall[];
  readonly waitForCalls: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

const upstream = 'https://api.anthropic.com';

interface OpenBlock {
  type: string;
  text: string;
  signature: string;
  data: string;
}

export function startCaptureProxy(): CaptureProxy {
  const calls: CapturedCall[] = [];
  const reading = new Set<Promise<void>>();
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 255,
    fetch: async (request) => {
      const url = new URL(request.url);
      const headers = new Headers(request.headers);

      headers.delete('host');
      headers.delete('accept-encoding');
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
      });

      if (!url.pathname.startsWith('/v1/messages') || url.pathname.includes('count_tokens')) {
        return response;
      }
      const sent = readBody(body);
      const call: CapturedCall = {
        model: String(sent.model ?? 'unknown'),
        thinking: sent.thinking ?? null,
        outputConfig: sent.output_config ?? null,
        status: response.status,
        blocks: [],
        events: {},
        usage: null,
      };

      calls.push(call);
      const outHeaders = new Headers(response.headers);

      outHeaders.delete('content-encoding');
      outHeaders.delete('content-length');
      if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const text = await response.text();

        updateFromMessage(call, text);
        return new Response(text, { status: response.status, headers: outHeaders });
      }
      const [toClient, toRead] = (response.body as ReadableStream<Uint8Array>).tee();
      const read = readStream(toRead, call).finally(() => {
        reading.delete(read);
      });

      reading.add(read);
      return new Response(toClient, { status: response.status, headers: outHeaders });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    waitForCalls: async () => {
      await Promise.all(reading);
    },
    stop: () => server.stop(true),
  };
}

function readBody(body: ArrayBuffer | undefined): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return {};
  }
}

const byteLength = (text: string): number => Buffer.byteLength(text, 'utf8');

function closeBlock(call: CapturedCall, block: OpenBlock): void {
  call.blocks.push({
    type: block.type,
    textBytes: byteLength(block.text),
    signatureBytes: byteLength(block.signature),
    dataBytes: byteLength(block.data),
    text: block.text,
  });
}

// a non-streamed response holds its blocks whole
function updateFromMessage(call: CapturedCall, text: string): void {
  try {
    const message = JSON.parse(text);

    call.usage = message.usage ?? null;
    for (const block of message.content ?? []) {
      closeBlock(call, {
        type: block.type,
        text: block.thinking ?? block.text ?? '',
        signature: block.signature ?? '',
        data: block.data ?? '',
      });
    }
  } catch {
    // an error body holds no blocks
  }
}

// rebuilds each content block from its start event and its deltas
async function readStream(stream: ReadableStream<Uint8Array>, call: CapturedCall): Promise<void> {
  const decoder = new TextDecoder();
  const open = new Map<number, OpenBlock>();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');

    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      let event: any;

      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      const inner = event.delta ?? event.content_block;
      const eventType =
        inner?.type === undefined
          ? event.type
          : `${event.type}/${inner.type} {${Object.keys(inner).sort().join(',')}}`;

      call.events[eventType] = (call.events[eventType] ?? 0) + 1;
      if (event.type === 'message_start') {
        call.usage = { ...event.message.usage };
      } else if (event.type === 'message_delta' && event.usage !== undefined) {
        call.usage = { ...call.usage, ...event.usage };
      } else if (event.type === 'content_block_start') {
        const block = event.content_block;

        open.set(event.index, {
          type: block.type,
          text: block.thinking ?? block.text ?? '',
          signature: block.signature ?? '',
          data: block.data ?? '',
        });
      } else if (event.type === 'content_block_delta') {
        const block = open.get(event.index);
        const delta = event.delta;

        if (block === undefined) {
          continue;
        }
        block.text += delta.thinking ?? delta.text ?? delta.partial_json ?? '';
        block.signature += delta.signature ?? '';
      } else if (event.type === 'content_block_stop') {
        const block = open.get(event.index);

        if (block !== undefined) {
          closeBlock(call, block);
          open.delete(event.index);
        }
      }
    }
  }
}
