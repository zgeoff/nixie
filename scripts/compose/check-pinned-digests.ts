import { appendFileSync, readFileSync } from 'node:fs';
import { $ } from 'bun';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const recipePath = 'deploy/compose/compose.yaml';

async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-pinned-digests.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const recipe = parseRecipeImages(readFileSync(recipePath, 'utf8'));

  for (const image of recipe.pinned) {
    const inspected =
      await $`docker buildx imagetools inspect ${image.name} --format ${'{{json .Manifest.Digest}}'}`.text();

    const actual = inspected.trim().replaceAll('"', '');

    if (actual !== image.digest) {
      console.log(
        `::error::${image.name} resolves to ${actual}, and compose.yaml pins ${image.digest}`,
      );

      process.exitCode = 1;

      return;
    }

    appendFileSync(summaryPath, `${image.name}@${image.digest}\n`);
  }

  if (recipe.hasUnpinned) {
    console.log('::error::compose.yaml names an image without a tag and digest');

    process.exitCode = 1;
  }
}

interface PinnedImage {
  readonly name: string;
  readonly digest: string;
}

const pinnedPattern = /image: (?<name>\S+:[^\s@]+)@(?<digest>sha256:[0-9a-f]{64})/gu;
const imageLinePattern = /^\s+image:.*$/gmu;
const digestEndPattern = /@sha256:[0-9a-f]{64}$/u;

function parseRecipeImages(text: string): {
  readonly pinned: readonly PinnedImage[];
  readonly hasUnpinned: boolean;
} {
  const pinned = [...text.matchAll(pinnedPattern)].map((match) => ({
    name: match.groups?.['name'] ?? '',
    digest: match.groups?.['digest'] ?? '',
  }));

  const unique = [...new Map(pinned.map((image) => [`${image.name}@${image.digest}`, image]))];

  return {
    pinned: unique
      .map(([, image]) => image)
      .toSorted((left, right) => left.name.localeCompare(right.name)),
    hasUnpinned: (text.match(imageLinePattern) ?? []).some((line) => !digestEndPattern.test(line)),
  };
}

if (import.meta.main) {
  await runCLI();
}
