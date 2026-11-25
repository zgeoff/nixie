import { z } from 'zod';
import type { VoiceDefinitions } from '../types';
import { defaultVoiceDefinitions } from './voice-definitions-schema';

export const voiceFilePaths = { voice: 'voice/voice.yaml', lines: 'voice/lines.yaml' } as const;

export interface VoiceFileProblem {
  readonly path: string;
  readonly reason: string;
}

export interface ParsedVoiceFiles {
  // null when no voice file holds a setting, so the definitions stay as they were without one
  readonly voice: VoiceDefinitions | null;

  // each file that the parse left unapplied, with its fault
  readonly problems: readonly VoiceFileProblem[];

  // the files that the parse applied
  readonly paths: ReadonlySet<string>;
}

const voiceFileSchema = z.strictObject({
  voice: z.string().min(1).optional(),
  hold_after_ms: z.int().positive().optional(),

  // US dollars per open minute
  price_per_minute: z.number().positive().optional(),
});

const linesFileSchema = z.strictObject({
  holding: z.string().min(1).optional(),
  reconnect: z.string().min(1).optional(),
  couldnt_finish: z.string().min(1).optional(),
  budget: z.string().min(1).optional(),
});

// Never throws: a file that fails to parse or to validate counts as absent, and its fault goes in
// `problems`, so a bad voice file never refuses a seed or stops the server.
export function parseVoiceFiles(texts: ReadonlyMap<string, string>): ParsedVoiceFiles {
  const problems: VoiceFileProblem[] = [];
  const voiceText = texts.get(voiceFilePaths.voice);
  const linesText = texts.get(voiceFilePaths.lines);

  const voiceFile =
    voiceText === undefined ? null : parseFile(voiceFilePaths.voice, voiceText, voiceFileSchema);

  const linesFile =
    linesText === undefined ? null : parseFile(voiceFilePaths.lines, linesText, linesFileSchema);

  for (const file of [voiceFile, linesFile]) {
    if (file?.status === 'refused') {
      problems.push(file.problem);
    }
  }

  const voiceData = voiceFile?.status === 'parsed' ? voiceFile.data : null;
  const linesData = linesFile?.status === 'parsed' ? linesFile.data : null;

  const paths = new Set([
    ...(voiceData === null ? [] : [voiceFilePaths.voice]),
    ...(linesData === null ? [] : [voiceFilePaths.lines]),
  ]);

  if (voiceData === null && linesData === null) {
    return { voice: null, problems, paths };
  }

  const defaults = defaultVoiceDefinitions;

  return {
    voice: {
      voice: voiceData?.voice ?? defaults.voice,
      holdAfterMs: voiceData?.hold_after_ms ?? defaults.holdAfterMs,
      pricePerMinuteMicros:
        voiceData?.price_per_minute === undefined
          ? defaults.pricePerMinuteMicros
          : Math.max(1, Math.round(voiceData.price_per_minute * 1_000_000)),
      lines: {
        holding: linesData?.holding ?? defaults.lines.holding,
        reconnect: linesData?.reconnect ?? defaults.lines.reconnect,
        couldntFinish: linesData?.couldnt_finish ?? defaults.lines.couldntFinish,
        budget: linesData?.budget ?? defaults.lines.budget,
      },
    },
    problems,
    paths,
  };
}

type ParsedFile<Schema extends z.ZodType> =
  | { readonly status: 'parsed'; readonly data: z.output<Schema> }
  | { readonly status: 'refused'; readonly problem: VoiceFileProblem };

function parseFile<Schema extends z.ZodType>(
  path: string,
  text: string,
  schema: Schema,
): ParsedFile<Schema> {
  const yaml = parseYAML(text);

  if (yaml instanceof Error) {
    return { status: 'refused', problem: { path, reason: yaml.message } };
  }

  // an empty file sets nothing
  const result = schema.safeParse(yaml ?? {});

  if (result.success) {
    return { status: 'parsed', data: result.data };
  }

  const reason = result.error.issues
    .map((issue) => {
      const at = issue.path.map(String).join('.');

      return at.length === 0 ? issue.message : `${at}: ${issue.message}`;
    })
    .join('; ');

  return { status: 'refused', problem: { path, reason } };
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
