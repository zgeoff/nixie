// GPT-Live as the voice layer: it owns turn-taking and small talk, and hands each real request to
// nixie's Claude turn through client delegation, then speaks that turn's answer.
import { match } from 'ts-pattern';
import { createActor } from 'xstate';
import { findSoundSpan } from './find-sound-span.ts';
import { gptLiveCallMachine } from './gpt-live-call-machine.ts';
import type { OpenSocket } from './open-vendor-socket.ts';
import { parseGptLiveEvent } from './parse-gpt-live-event.ts';
import { toPcmBase64 } from './to-pcm-base64.ts';
import type { VoiceCall } from './voice-call.ts';

export function startGptLiveCall(connection: {
  // The quiet spell after which the turn ends, because GPT-Live sends no event when it stops.
  quietMs: number;
  instructions: string;
  key: string;
  openSocket: OpenSocket;
  runDelegation: (heard: string) => Promise<string>;
  sampleRate: number;
  soundThreshold: number;
  voice: string;
}): VoiceCall {
  const socket = connection.openSocket('wss://api.openai.com/v1/live/sessions', {
    authorization: `Bearer ${connection.key}`,
  });
  const ready = Promise.withResolvers<void>();
  const ended = Promise.withResolvers<void>();
  const lifecycle = createActor(gptLiveCallMachine, { input: { quietMs: connection.quietMs } });
  lifecycle.subscribe((snapshot) => {
    match(snapshot.value)
      .with('ended', () => ended.resolve())
      .with('failed', () => {
        ready.reject(snapshot.context.error);
        ended.reject(snapshot.context.error);
      })
      .with('opening', 'speaking', 'waiting', () => undefined)
      .exhaustive();
  });
  lifecycle.start();
  let heard = '';
  let said = '';
  const send = (event: Record<string, unknown>): void => socket.send(JSON.stringify(event));
  const call: VoiceCall = {
    appendAudio: (window) => send({ audio: toPcmBase64(window), type: 'session.input_audio.append' }),
    close: () => {
      lifecycle.stop();
      socket.close();
    },
    ended: ended.promise,
    heard: () => heard,
    ready: ready.promise,
    received: [],
    said: () => said,
    stopPlaybackAt: [],
    toolCalls: [],
  };
  socket.addEventListener('open', () => {
    send({
      session: {
        audio: { format: { rate: connection.sampleRate, type: 'audio/pcm' }, output: { voice: connection.voice } },
        delegation: { type: 'client' },
        instructions: connection.instructions,
        model: 'gpt-live-1',
      },
      type: 'session.start',
    });
  });
  socket.addEventListener('close', () =>
    lifecycle.send({ error: new Error('gpt-live: the socket closed before the reply ended'), type: 'failed' }),
  );
  socket.addEventListener('error', () =>
    lifecycle.send({ error: new Error('gpt-live: the socket failed'), type: 'failed' }),
  );
  socket.addEventListener('message', (message) => {
    match(parseGptLiveEvent(JSON.parse(String(message.data))))
      .with({ kind: 'audio' }, (event) => {
        call.received.push({ at: performance.now(), samples: event.audio });
        if (findSoundSpan(event.audio, connection.soundThreshold) !== undefined) {
          lifecycle.send({ type: 'sound' });
        }
      })
      .with({ kind: 'delegation' }, (event) => {
        lifecycle.send({ type: 'delegated' });
        call.toolCalls.push('delegation');
        connection.runDelegation(heard).then(
          (answer) => {
            send({ content: answer, delegation_id: event.delegationID, type: 'session.commentary.append' });
            lifecycle.send({ type: 'answered' });
          },
          (error: unknown) => lifecycle.send({ error, type: 'failed' }),
        );
      })
      .with({ kind: 'error' }, (event) =>
        lifecycle.send({ error: new Error(`gpt-live: ${event.message}`), type: 'failed' }),
      )
      .with({ kind: 'heard' }, (event) => {
        heard += event.text;
      })
      .with({ kind: 'ready' }, () => {
        ready.resolve();
        lifecycle.send({ type: 'opened' });
      })
      .with({ kind: 'said' }, (event) => {
        said += event.text;
      })
      .with({ kind: 'ignored' }, () => undefined)
      .exhaustive();
  });
  return call;
}
