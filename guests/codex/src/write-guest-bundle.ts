import { join } from 'node:path';
import { parseArgs } from 'node:util';

export interface GuestBundleArgs {
  readonly outDir: string;
}

export type ParsedBundleArgs =
  | { readonly isValid: true; readonly args: GuestBundleArgs }
  | { readonly isValid: false; readonly usage: string };

const usage = 'usage: bun write-guest-bundle.ts --out <out_dir>';

export function parseBundleArgs(argv: readonly string[]): ParsedBundleArgs {
  const parsed = parseArgs({
    args: [...argv],
    strict: false,
    options: { out: { type: 'string' } },
  });

  const outDir = parsed.values.out;

  if (typeof outDir !== 'string' || outDir === '') {
    return { isValid: false, usage };
  }

  return { isValid: true, args: { outDir } };
}

// The image holds this bundle in place of the workspace.
export async function writeGuestBundle(args: GuestBundleArgs): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'main.ts')],
    target: 'bun',
    minify: false,
    naming: '[name].[ext]',
    outdir: args.outDir,
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'the guest bundle failed to build');
  }
}

if (import.meta.main) {
  const parsed = parseBundleArgs(process.argv.slice(2));

  if (parsed.isValid) {
    await writeGuestBundle(parsed.args);
  } else {
    console.error(parsed.usage);

    process.exitCode = 2;
  }
}
