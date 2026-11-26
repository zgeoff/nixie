import { WringerError } from '@wringer/core';
import { $ } from 'bun';
import { buildServedBlobsArgv, servedSourceFolders } from './build-served-blobs-argv';
import type { ServedContainer } from './build-served-blobs-argv';
import type { createPreviewHost } from './create-preview-host';
import { pickCommitRefusal } from './pick-commit-refusal';
import { collectExtraPaths, pickSourceRefusal } from './pick-source-refusal';
import { readIgnoredPaths } from './read-ignored-paths';
import { servedCommitArgv } from './read-served-commit';

type PreviewHost = ReturnType<typeof createPreviewHost>;

const previewRefusalHint =
  'Push this commit, open the preview link on the pull request to rebuild the preview, then run `bun verify attach` and `bun verify doctor` again.';

// The checkout can move on while a container from an older build still serves, so the doctor also
// compares the container's files with this tree. A doctor check's exec refuses every raw command,
// so the check runs its reads on the preview's host itself.
export async function checkPreviewCommit(host: PreviewHost): Promise<{ commit: string }> {
  const served = await host.run({ argv: servedCommitArgv, access: 'read-only' });
  const head = await $`git rev-parse HEAD`.quiet().text();

  const commitRefusal = pickCommitRefusal(served.stdout, head);

  if (commitRefusal !== null) {
    throw new WringerError('check-failed', { message: commitRefusal, hint: previewRefusalHint });
  }

  for (const container of ['nixie', 'web'] as const) {
    await checkServedSources(host, container);
  }

  return { commit: served.stdout.trim() };
}

async function checkServedSources(host: PreviewHost, container: ServedContainer): Promise<void> {
  const listed = await host.run({ argv: buildServedBlobsArgv(container), access: 'read-only' });

  if (listed.exitCode !== 0) {
    throw new WringerError('environment', {
      message: `the preview's ${container} container could not list its sources: ${listed.stderr.trim()}`,
      hint: 'Open the preview link on the pull request, wait for the preview to serve, then run `bun verify doctor` again.',
    });
  }

  const committed = await $`git ls-tree -r HEAD -- ${servedSourceFolders}`.quiet().text();

  const extras = collectExtraPaths(committed, listed.stdout);

  const ignored = await readIgnoredPaths(extras);

  const refusal = pickSourceRefusal({ container, committed, served: listed.stdout, ignored });

  if (refusal !== null) {
    throw new WringerError('check-failed', { message: refusal, hint: previewRefusalHint });
  }
}
