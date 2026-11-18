import { WringerError } from '@wringer/core';
import { $ } from 'bun';

type Env = Readonly<Record<string, string | undefined>>;

// The doctor's prod checks read the cluster as a service account that may only read nixie's pod, its
// logs and its readiness, so the kubeconfig in the environment holds no write. The checks run
// kubectl on this machine, because a doctor check's exec refuses every raw command.
export async function runProdKubectl(env: Env, args: readonly string[]): Promise<string> {
  const kubeconfig = env['NIXIE_PROD_KUBECONFIG'];

  if (kubeconfig === undefined || kubeconfig === '') {
    throw new WringerError('environment', {
      message: 'The prod target needs NIXIE_PROD_KUBECONFIG.',
      hint: "Set NIXIE_PROD_KUBECONFIG to the path of the read-only kubeconfig for nixie's cluster; the verify skill says where it lives.",
    });
  }

  const ran = await $`kubectl --kubeconfig ${kubeconfig} --namespace nixie ${args}`
    .quiet()
    .nothrow();

  if (ran.exitCode !== 0) {
    throw new WringerError('check-failed', {
      message: `kubectl ${args.join(' ')} exited ${String(ran.exitCode)}: ${ran.stderr.toString().trim()}`,
    });
  }

  return ran.stdout.toString();
}
