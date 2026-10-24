// GPT-Live as the voice layer: it owns turn-taking and small talk, and hands each real request to
// nixie's Claude turn through client delegation, then speaks that turn's answer.
import { findSoundSpan } from './find-sound-span.ts';
import { match } from 'ts-pattern';
import { parseGptLiveEvent } from './parse-gpt-live-event.ts';
import { toPcmBase64 } from './to-pcm-base64.ts';
import type { VoiceCall } from './voice-call.ts';

export function startGptLiveCall(connection: {
  // GPT-Live sends no event when it stops speaking, so the turn ends after this long without sound.
  quietMs: number;
  instructions: string;
  key: string;
  runDelegation: (heard: string) => Promise<string>;
  sampleRate: number;
  soundThreshold: number;
  voice: string;
}): VoiceCall & { delegations: () => number } {
  const socket = new WebSocket('wss://api.openai.com/v1/live/sessions', {
    headers: { authorization: `Bearer ${connection.key}` },
  });
  const ready = Promise.withResolvers<void>();
  const ended = Promise.withResolvers<void>();
  let heard = '';
  let said = '';
  let delegations = 0;
  let pending = 0;
  let lastSoundAt: number | undefined;
  const send = (event: Record<string, unknown>): void => socket.send(JSON.stringify(event));
  const call: VoiceCall & { delegations: () => number } = {
    appendAudio: (window) => send({ audio: toPcmBase64(window), type: 'session.input_audio.append' }),
    close: () => {
      clearInterval(watch);
      socket.close();
    },
    delegations: () => delegations,
    ended: ended.promise,
    heard: () => heard,
    ready: ready.promise,
    received: [],
    said: () => said,
    toolCalls: [],
  };
  // A delegated answer reaches the caller only once GPT-Live speaks it, so the quiet that counts
  // starts after the last sound that followed the last answer.
  let lastAnswerAt = 0;
  const watch = setInterval(() => {
    if (
      lastSoundAt !== undefined &&
      lastSoundAt > lastAnswerAt &&
      pending === 0 &&
      performance.now() - lastSoundAt > connection.quietMs
    ) {
      ended.resolve();
    }
  }, 100);
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
  socket.addEventListener('close', () => ended.reject(new Error('gpt-live: the socket closed before the reply ended')));
  socket.addEventListener('error', () => {
    ready.reject(new Error('gpt-live: the socket failed'));
    ended.reject(new Error('gpt-live: the socket failed'));
  });
  socket.addEventListener('message', (message) => {
    match(parseGptLiveEvent(JSON.parse(String(message.data))))
      .with({ kind: 'audio' }, (event) => {
        const at = performance.now();
        call.received.push({ at, samples: event.audio });
        if (findSoundSpan(event.audio, connection.soundThreshold) !== undefined) {
          lastSoundAt = at;
        }
      })
      .with({ kind: 'delegation' }, (event) => {
        delegations++;
        pending++;
        call.toolCalls.push('delegation');
        connection
          .runDelegation(heard)
          .then((answer) => {
            send({ content: answer, delegation_id: event.delegationID, type: 'session.commentary.append' });
            lastAnswerAt = performance.now();
          })
          .catch((error: unknown) => ended.reject(error))
          .finally(() => {
            pending--;
          });
      })
      .with({ kind: 'error' }, (event) => ended.reject(new Error(`gpt-live: ${event.message}`)))
      .with({ kind: 'heard' }, (event) => {
        heard += event.text;
      })
      .with({ kind: 'ready' }, () => ready.resolve())
      .with({ kind: 'said' }, (event) => {
        said += event.text;
      })
      .with({ kind: 'ignored' }, () => undefined)
      .exhaustive();
  });
  return call;
}
