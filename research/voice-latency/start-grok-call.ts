// Grok Voice as nixie on its own: its own turn detection, nixie's persona, and the stub tools as
// function tools that this call answers with their fixed results.
import { match } from 'ts-pattern';
import { parseGrokEvent } from './parse-grok-event.ts';
import { stubTools } from './stub-tool-answers.ts';
import { toPcmBase64 } from './to-pcm-base64.ts';
import type { VoiceCall } from './voice-call.ts';

export function startGrokCall(connection: {
  instructions: string;
  key: string;
  sampleRate: number;
  voice: string;
}): VoiceCall {
  const socket = new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-latest', {
    headers: { authorization: `Bearer ${connection.key}` },
  });
  const ready = Promise.withResolvers<void>();
  const ended = Promise.withResolvers<void>();
  const call: VoiceCall = {
    appendAudio: (window) => {
      socket.send(JSON.stringify({ audio: toPcmBase64(window), type: 'input_audio_buffer.append' }));
    },
    close: () => socket.close(),
    ended: ended.promise,
    heard: () => heard,
    ready: ready.promise,
    received: [],
    said: () => said,
    toolCalls: [],
  };
  let heard = '';
  let said = '';
  const send = (event: Record<string, unknown>): void => socket.send(JSON.stringify(event));
  socket.addEventListener('open', () => {
    const format = { rate: connection.sampleRate, type: 'audio/pcm' };
    send({
      session: {
        audio: { input: { format }, output: { format } },
        instructions: connection.instructions,
        tools: Object.entries(stubTools).map(([name, stub]) => ({
          description: stub.description,
          name,
          parameters: { additionalProperties: true, properties: {}, type: 'object' },
          type: 'function',
        })),
        turn_detection: { type: 'server_vad' },
        voice: connection.voice,
      },
      type: 'session.update',
    });
  });
  socket.addEventListener('close', () => ended.reject(new Error('grok: the socket closed before the reply ended')));
  socket.addEventListener('error', () => {
    ready.reject(new Error('grok: the socket failed'));
    ended.reject(new Error('grok: the socket failed'));
  });
  socket.addEventListener('message', (message) => {
    match(parseGrokEvent(JSON.parse(String(message.data))))
      .with({ kind: 'audio' }, (event) => call.received.push({ at: performance.now(), samples: event.audio }))
      .with({ kind: 'tool-call' }, (event) => {
        call.toolCalls.push(event.name);
        const stub = Object.entries(stubTools).find(([name]) => name === event.name)?.[1];
        send({
          item: { call_id: event.callID, output: stub?.answer ?? 'That tool does not exist.', type: 'function_call_output' },
          type: 'conversation.item.create',
        });
      })
      .with({ kind: 'response-done' }, (event) => {
        if (event.hasToolCall) {
          send({ type: 'response.create' });
        } else {
          ended.resolve();
        }
      })
      .with({ kind: 'error' }, (event) => ended.reject(new Error(`grok: ${event.message}`)))
      .with({ kind: 'heard' }, (event) => {
        heard += `${heard === '' ? '' : ' '}${event.text}`;
      })
      .with({ kind: 'ready' }, () => ready.resolve())
      .with({ kind: 'said' }, (event) => {
        said += `${said === '' ? '' : ' '}${event.text}`;
      })
      .with({ kind: 'ignored' }, () => undefined)
      .exhaustive();
  });
  return call;
}
