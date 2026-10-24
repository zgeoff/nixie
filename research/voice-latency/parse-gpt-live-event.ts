// Reads one server event of OpenAI's GPT-Live API into what the runner acts on. GPT-Live streams its
// output audio for the whole session, silence included, and sends no event when it stops speaking.
import { match } from 'ts-pattern';
import { z } from 'zod';
import { toFloatSamples } from './to-float-samples.ts';

export type GptLiveEvent =
  | { audio: Float32Array; kind: 'audio' }
  | { delegationID: string; kind: 'delegation' }
  | { kind: 'error'; message: string }
  | { kind: 'heard'; text: string }
  | { kind: 'ignored' }
  | { kind: 'ready' }
  | { kind: 'said'; text: string };

const gptLiveEvent = z.discriminatedUnion('type', [
  z.object({ delta: z.string(), type: z.literal('session.output_audio.delta') }),
  z.object({
    delegation: z.object({ id: z.string(), target: z.literal('client') }),
    type: z.literal('session.delegation.created'),
  }),
  z.object({ error: z.object({ message: z.string() }), type: z.literal('error') }),
  z.object({ delta: z.string(), type: z.literal('session.input_transcript.delta') }),
  z.object({ type: z.literal('session.started') }),
  z.object({ delta: z.string(), type: z.literal('session.output_transcript.delta') }),
]);

export function parseGptLiveEvent(raw: unknown): GptLiveEvent {
  const parsed = gptLiveEvent.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'ignored' };
  }
  return match(parsed.data)
    .returnType<GptLiveEvent>()
    .with({ type: 'session.output_audio.delta' }, (event) => ({ audio: toFloatSamples(event.delta), kind: 'audio' }))
    .with({ type: 'session.delegation.created' }, (event) => ({ delegationID: event.delegation.id, kind: 'delegation' }))
    .with({ type: 'error' }, (event) => ({ kind: 'error', message: event.error.message }))
    .with({ type: 'session.input_transcript.delta' }, (event) => ({ kind: 'heard', text: event.delta }))
    .with({ type: 'session.started' }, () => ({ kind: 'ready' }))
    .with({ type: 'session.output_transcript.delta' }, (event) => ({ kind: 'said', text: event.delta }))
    .exhaustive();
}
