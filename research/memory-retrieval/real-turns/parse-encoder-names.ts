import type { EncoderName } from './load-turn-encoder.ts';
import { ENCODERS } from './load-turn-encoder.ts';

export type ParsedEncoderNames = { names: EncoderName[] } | { unknown: string[] };

export function parseEncoderNames(text: string): ParsedEncoderNames {
  const requested = text
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');

  const names = requested.filter((name): name is EncoderName => Object.hasOwn(ENCODERS, name));
  const unknown = requested.filter((name) => !Object.hasOwn(ENCODERS, name));

  return unknown.length > 0 ? { unknown } : { names };
}
