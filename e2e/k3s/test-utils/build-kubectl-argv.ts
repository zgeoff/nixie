import type { KubectlTarget } from './parse-live-env';

// Builds a kubectl command line with the target's kubeconfig and namespace ahead of the command's
// own arguments, so no command reaches another cluster or namespace.
export function buildKubectlArgv(target: KubectlTarget, args: readonly string[]): string[] {
  return [
    ...target.argv,
    '--kubeconfig',
    target.kubeconfig,
    '--namespace',
    target.namespace,
    ...args,
  ];
}
