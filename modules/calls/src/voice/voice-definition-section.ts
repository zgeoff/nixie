import type { DefinitionSection } from '@heynixie/definitions';
import { z } from 'zod';
import type { VoiceDefinitions } from '../types';
import { parseVoiceFiles } from './parse-voice-files';
import { defaultVoiceDefinitions, voiceDefinitionsSchema } from './voice-definitions-schema';

const voiceKey = 'voice';
const storedSchema = z.looseObject({ [voiceKey]: voiceDefinitionsSchema.nullable().default(null) });

// The `voice/` folder of the definitions, which the server adds when the voice section is set. The
// first format that reads it is 5.
export const voiceDefinitionSection: DefinitionSection = {
  key: voiceKey,
  folder: 'voice',
  minFormat: 5,
  problemEvent: 'definitions.voice_file_skipped',
  parse: (texts) => {
    const parsed = parseVoiceFiles(texts);

    return { value: parsed.voice, problems: parsed.problems, paths: parsed.paths };
  },
  toForm: (value) => {
    const voice = voiceDefinitionsSchema.parse(value);

    return {
      voice: voice.voice,
      holdAfterMs: voice.holdAfterMs,
      pricePerMinuteMicros: voice.pricePerMinuteMicros,
      lines: {
        holding: voice.lines.holding,
        reconnect: voice.lines.reconnect,
        couldntFinish: voice.lines.couldntFinish,
        budget: voice.lines.budget,
      },
    };
  },
  parseForm: (form) => {
    const stored = storedSchema.safeParse(form);

    return stored.success ? (stored.data[voiceKey] ?? null) : null;
  },
};

// The voice settings among the sections in force, or the defaults when the definitions hold none.
export function readVoiceDefinitions(
  sections: Readonly<Record<string, unknown>>,
): VoiceDefinitions {
  const stored = voiceDefinitionsSchema.safeParse(sections[voiceKey]);

  return stored.success ? stored.data : defaultVoiceDefinitions;
}
