// Reads one server event of Grok Voice's realtime API into what the runner acts on. The field names
// come from a live session's events, which the API reference names only in part.
import { match } from 'ts-pattern';
import { z } from 'zod';
import { toFloatSamples } from './to-float-samples.ts';

export type GrokEvent =
  | { audio: Float32Array; kind: 'audio' }
  | { arguments: string; callID: string; kind: 'tool-call'; name: string }
  | { hasToolCall: boolean; kind: 'response-done' }
  | { kind: 'error'; message: string }
  | { kind: 'heard'; text: string }
  | { kind: 'ignored' }
  | { kind: 'ready' }
  | { kind: 'said'; text: string };

const grokEvent = z.discriminatedUnion('type', [
  z.object({ delta: z.string(), type: z.literal('response.output_audio.delta') }),
  z.object({
    arguments: z.string(),
    call_id: z.string(),
    name: z.string(),
    type: z.literal('response.function_call_arguments.done'),
  }),
  z.object({
    response: z.object({ output: z.array(z.object({ type: z.string() })) }),
    type: z.literal('response.done'),
  }),
  z.object({ error: z.object({ message: z.string() }), type: z.literal('error') }),
  z.object({ transcript: z.string(), type: z.literal('conversation.item.input_audio_transcription.completed') }),
  z.object({ type: z.literal('session.updated') }),
  z.object({ transcript: z.string(), type: z.literal('response.output_audio_transcript.done') }),
]);

export function parseGrokEvent(raw: unknown): GrokEvent {
  const parsed = grokEvent.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'ignored' };
  }
  return match(parsed.data)
    .returnType<GrokEvent>()
    .with({ type: 'response.output_audio.delta' }, (event) => ({ audio: toFloatSamples(event.delta), kind: 'audio' }))
    .with({ type: 'response.function_call_arguments.done' }, (event) => ({
      arguments: event.arguments,
      callID: event.call_id,
      kind: 'tool-call',
      name: event.name,
    }))
    .with({ type: 'response.done' }, (event) => ({
      hasToolCall: event.response.output.some((item) => item.type === 'function_call'),
      kind: 'response-done',
    }))
    .with({ type: 'error' }, (event) => ({ kind: 'error', message: event.error.message }))
    .with({ type: 'conversation.item.input_audio_transcription.completed' }, (event) => ({
      kind: 'heard',
      text: event.transcript,
    }))
    .with({ type: 'session.updated' }, () => ({ kind: 'ready' }))
    .with({ type: 'response.output_audio_transcript.done' }, (event) => ({ kind: 'said', text: event.transcript }))
    .exhaustive();
}
