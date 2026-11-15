import { join } from 'node:path';
import { parseArgs } from 'node:util';

export interface GuestBundleArgs {
  readonly outDir: string;
  readonly cliPath: string;
}

export type ParsedBundleArgs =
  | { readonly isValid: true; readonly args: GuestBundleArgs }
  | { readonly isValid: false; readonly usage: string };

const usage = 'usage: bun write-guest-bundles.ts --out <out_dir> --cli-path <cli_path>';

export function parseBundleArgs(argv: readonly string[]): ParsedBundleArgs {
  const parsed = parseArgs({
    args: [...argv],
    strict: false,
    options: { out: { type: 'string' }, 'cli-path': { type: 'string' } },
  });

  const outDir = parsed.values.out;
  const cliPath = parsed.values['cli-path'];

  if (
    typeof outDir !== 'string' ||
    outDir === '' ||
    typeof cliPath !== 'string' ||
    cliPath === ''
  ) {
    return { isValid: false, usage };
  }

  return { isValid: true, args: { outDir, cliPath } };
}

// The image holds these 2 bundles in place of the workspace, so the build bakes in the CLI's path.
export async function writeGuestBundles(args: GuestBundleArgs): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'main.ts'), join(import.meta.dir, 'check.ts')],
    target: 'bun',
    minify: false,
    naming: '[name].[ext]',
    define: { NIXIE_CLI_PATH: JSON.stringify(args.cliPath) },
    outdir: args.outDir,
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'the guest bundles failed to build');
  }
}

if (import.meta.main) {
  const parsed = parseBundleArgs(process.argv.slice(2));

  if (parsed.isValid) {
    await writeGuestBundles(parsed.args);
  } else {
    console.error(parsed.usage);

    process.exitCode = 2;
  }
}
