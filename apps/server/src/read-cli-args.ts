import { cli } from 'gunshi/bone';
import type { CommandContext, ExtendContext } from 'gunshi/bone';
import { define, lazy } from 'gunshi/definition';
import { isArgsValidationError, isCommandNotFoundError } from 'gunshi/plugin';
import type { CLIFlags } from './types';

export type ParsedCLIArgs =
  | {
      readonly kind: 'command';
      readonly command: string;
      readonly flags: CLIFlags;
      readonly args: readonly string[];
    }
  | { readonly kind: 'unknown-command'; readonly command: string }
  | { readonly kind: 'invalid-flags'; readonly message: string };

const CLI_OPTIONS = {
  config: { type: 'string', default: '/etc/nixie/config.yaml' },
  manifest: { type: 'string', default: '/app/sandbox-manifest.json' },

  encoder: { type: 'string', default: '/app/encoder' },
  sops: { type: 'string', default: '/usr/local/bin/sops' },
  live: { type: 'boolean', default: false },
  hash: { type: 'string' },
  revise: { type: 'string' },
  'as-new': { type: 'boolean', default: false },
  text: { type: 'string' },
  reason: { type: 'string' },
  files: { type: 'string' },
  keep: { type: 'enum', choices: ['nixie', 'definitions'] },
  'keep-sessions': { type: 'boolean', default: false },
  yes: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  database: { type: 'string' },
} as const;

interface CLIParams {
  readonly args: typeof CLI_OPTIONS;
  readonly extensions: ExtendContext;
}

export async function readCLIArgs(
  argv: readonly string[],
  commandNames: readonly string[],
): Promise<ParsedCLIArgs> {
  let parsed: ParsedCLIArgs = { kind: 'unknown-command', command: '' };

  const read = (
    command: string,
    ctx: Readonly<CommandContext<CLIParams>>,
    args: readonly string[],
  ): void => {
    parsed = { kind: 'command', command, flags: ctx.values, args };
  };

  const subCommands = Object.fromEntries(
    commandNames.map((name) => [
      name,
      lazy(
        () => (ctx: Readonly<CommandContext<CLIParams>>) => {
          read(name, ctx, [...ctx.positionals.slice(ctx.commandPath.length), ...ctx.rest]);
        },
        { name, args: CLI_OPTIONS },
      ),
    ]),
  );

  const entry = define({
    name: 'nixie',
    args: CLI_OPTIONS,

    // gunshi leaves the words after `--` unread, so a command line with no command before `--`
    // takes its command from the first of them.
    run: (ctx) => {
      const [command, ...args] = ctx.rest;

      if (command === undefined) {
        read('serve', ctx, []);
      } else if (commandNames.includes(command)) {
        read(command, ctx, args);
      } else {
        parsed = { kind: 'unknown-command', command };
      }
    },
  });

  try {
    await cli([...argv], entry, { subCommands, strict: true, onBeforeCommand: requireValidFlags });
  } catch (error) {
    return parseRefusal(error);
  }

  return parsed;
}

// gunshi records a flag that lacks its value without stopping the command, so the flags are
// checked before any command runs.
function requireValidFlags(ctx: Readonly<CommandContext>): void {
  if (ctx.validationError !== undefined) {
    throw ctx.validationError;
  }
}

// gunshi throws one AggregateError that holds every reason it refused the command line, so any
// other error is not the command line's fault.
function parseRefusal(error: unknown): ParsedCLIArgs {
  if (!(error instanceof AggregateError)) {
    throw error;
  }

  const notFound = error.errors.find(isCommandNotFoundError);

  if (notFound !== undefined) {
    return { kind: 'unknown-command', command: notFound.commandName };
  }

  if (!error.errors.every(isArgsValidationError)) {
    throw error;
  }

  return {
    kind: 'invalid-flags',
    message: error.errors.map((reason: Error) => reason.message).join('\n'),
  };
}
