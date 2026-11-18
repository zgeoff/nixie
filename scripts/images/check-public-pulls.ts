import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { parseSandboxManifest, readSandboxManifest } from '../lib/read-sandbox-manifest.ts';

// The release step passes the manifest it built as SANDBOX_MANIFEST; the images workflow leaves it
// out and the script reads the committed manifest.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-public-pulls.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const manifestText = process.env['SANDBOX_MANIFEST'];

  const manifest =
    manifestText === undefined
      ? readSandboxManifest('apps/server/sandbox-manifest.json')
      : parseSandboxManifest(manifestText);

  const result =
    await $`bash .github/scripts/check-public-pulls.sh ${Object.values(manifest)}`.nothrow();

  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  await runCLI();
}
