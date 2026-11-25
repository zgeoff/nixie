import type { CallsContext, SpeechLayer, VoiceConfig } from '@heynixie/calls';
import { defaultVoiceDefinitions } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { InForce } from '../types';

export interface ServerCallsOptions {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly budgets: CallsContext['budgets'];
  readonly inForce: InForce;

  // the voice section of the config, or null without it, which turns calls off
  readonly voice: VoiceConfig | null;
  readonly logEvent: Logger;

  // null where the server wires no adapter
  readonly speech: SpeechLayer | null;
}

// The calls module's context. The server holds no speech adapter yet, so `calls.start` answers
// SPEECH_UNAVAILABLE for a configured voice unless a test build passes a speech layer, and no call
// reaches the task or the instructions below.
export function buildServerCalls(options: ServerCallsOptions): CallsContext {
  return {
    log: options.log,
    clock: options.clock,
    definitions: options.definitions,
    logEvent: options.logEvent,
    budgets: options.budgets,
    voice: options.voice,
    speech: options.speech,
    readVoiceDefinitions: () => options.inForce.read()?.voice ?? defaultVoiceDefinitions,
    createTask: () => Promise.reject(new Error('a call task needs the call runner')),
    readInstructions: () => Promise.reject(new Error('a call needs the voice-call prompt')),
    sessions: new Map(),
    openings: new Set(),
  };
}
