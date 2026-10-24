import { expect, test } from 'bun:test';
import { parseEncoderNames } from './parse-encoder-names.ts';

test('it reads a comma-separated list of known encoders', () => {
  expect(parseEncoderNames('leaf-ir-q8, bge-small')).toStrictEqual({ names: ['leaf-ir-q8', 'bge-small'] });
});

test('it returns every unknown encoder name instead of dropping it', () => {
  expect(parseEncoderNames('leaf-ir-q8,bge-smal,toString')).toStrictEqual({ unknown: ['bge-smal', 'toString'] });
});
