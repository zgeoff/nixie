import { expect, test } from 'bun:test';
import { buildKubectlArgv } from './build-kubectl-argv';

test('it puts the kubeconfig and the namespace between kubectl and the command', () => {
  expect(
    buildKubectlArgv(
      { argv: ['bun', 'kubectl.ts'], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
      ['logs', 'nixie-0'],
    ),
  ).toStrictEqual([
    'bun',
    'kubectl.ts',
    '--kubeconfig',
    '/tmp/kubeconfig',
    '--namespace',
    'nixie',
    'logs',
    'nixie-0',
  ]);
});
