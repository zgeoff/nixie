import { WringerError, ssh } from '@wringer/core';
import type { Host } from '@wringer/core';
import { buildPreviewImpName } from './build-preview-imp-name';
import type { PullRequest } from './read-pull-request';

type Env = Readonly<Record<string, string | undefined>>;

// Each command runs inside the pull request's preview imp, over SSH to the machine that runs the
// imps. The machine and its exec command come from the environment, so no deployment's names live
// in the repo, and the imp's name waits for the pull request's number.
export function createPreviewHost(env: Env, readPullRequest: () => Promise<PullRequest>): Host {
  const cached: { host: Promise<Host> | null } = { host: null };

  const readHost = (): Promise<Host> => {
    cached.host ??= readImpHost(env, readPullRequest);

    return cached.host;
  };

  return {
    kind: 'ssh',
    run: async (request) => {
      const host = await readHost();

      return host.run(request);
    },
    follow: async (request) => {
      const host = await readHost();

      return host.follow(request);
    },
  };
}

async function readImpHost(env: Env, readPullRequest: () => Promise<PullRequest>): Promise<Host> {
  const destination = env['NIXIE_PREVIEW_SSH'];
  const impExec = env['NIXIE_PREVIEW_IMP_EXEC']?.split(' ').filter((word) => word !== '');

  if (
    destination === undefined ||
    destination === '' ||
    impExec === undefined ||
    impExec.length === 0
  ) {
    throw new WringerError('environment', {
      message: 'The preview target needs NIXIE_PREVIEW_SSH and NIXIE_PREVIEW_IMP_EXEC.',
      hint: 'Set NIXIE_PREVIEW_SSH to the SSH destination of the machine that runs the preview imps, and NIXIE_PREVIEW_IMP_EXEC to the command there that runs a command in an imp, up to the imp name.',
    });
  }

  const pullRequest = await readPullRequest();

  const imp = buildPreviewImpName(pullRequest.repo, pullRequest.number);

  return ssh({ destination, prefix: [{ argv: [...impExec, imp, '--'], shell: false }] });
}
