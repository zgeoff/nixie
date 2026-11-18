import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { parseSandboxManifest } from '../lib/read-sandbox-manifest.ts';

// The sandbox images first and nixie last, so Renovate never sees a nixie version whose images are
// untagged.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('tag-images.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const version = getStepEnv(process.env, 'VERSION');

  const sandboxRefs = Object.values(
    parseSandboxManifest(getStepEnv(process.env, 'SANDBOX_MANIFEST')),
  );

  const refs = [
    ...sandboxRefs,
    ...['BACKUP', 'WEB', 'NIXIE'].map((name) => getStepEnv(process.env, name)),
  ];

  const result = await $`bash .github/scripts/tag-images.sh ${version} ${refs}`.nothrow();

  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  await runCLI();
}
