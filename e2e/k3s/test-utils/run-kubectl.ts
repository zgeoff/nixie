import { buildKubectlArgv } from './build-kubectl-argv';
import type { KubectlTarget } from './parse-live-env';

// Runs one kubectl command against the target's kubeconfig and namespace, and returns its stdout.
// A command that exits non-zero throws with its stderr, so a refused call fails the check at once.
export async function runKubectl(target: KubectlTarget, args: readonly string[]): Promise<string> {
  const child = Bun.spawn(buildKubectlArgv(target, args), {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (code !== 0) {
    throw new Error(`kubectl ${args.join(' ')} exited ${code}: ${stderr.trim()}`);
  }
  return stdout;
}
