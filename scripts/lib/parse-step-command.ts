import { parseArgs } from 'node:util';

export interface StepArgument {
  readonly choices: readonly string[];
}

export type StepCommand =
  | { readonly isValid: true; readonly values: readonly string[] }
  | { readonly isValid: false; readonly usage: string };

export function parseStepCommand(
  script: string,
  stepArguments: readonly StepArgument[],
  argv: readonly string[],
): StepCommand {
  const usage = [
    'usage:',
    script,
    ...stepArguments.map((argument) => `<${argument.choices.join('|')}>`),
  ].join(' ');

  const parsed = parseArgs({
    args: [...argv],
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  const hasFlag = parsed.tokens.some((token) => token.kind !== 'positional');
  const values = parsed.positionals;

  const isOutsideChoices = values.some(
    (value, index) => stepArguments[index]?.choices.includes(value) !== true,
  );

  if (hasFlag || values.length !== stepArguments.length || isOutsideChoices) {
    return { isValid: false, usage };
  }

  return { isValid: true, values };
}
