import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPushWorkflowCopy, copiedWorkflowNames } from './check-push-workflow-copy.ts';

function setupTest(name: string) {
  const workflows = join(import.meta.dir, '..', '..', '.github', 'workflows');

  return {
    pullRequest: readFileSync(join(workflows, `${name}.yml`), 'utf8'),
    main: readFileSync(join(workflows, `${name}-main.yml`), 'utf8'),
  };
}

test.each(copiedWorkflowNames)('it finds the same jobs in %s.yml and its -main copy', (name) => {
  const ctx = setupTest(name);

  expect(checkPushWorkflowCopy(name, ctx.pullRequest, ctx.main)).toStrictEqual([]);
});

test('it names the copy whose jobs differ', () => {
  const ctx = setupTest('preview');
  const main = ctx.main.replace('timeout-minutes: 20', 'timeout-minutes: 30');

  expect(checkPushWorkflowCopy('preview', ctx.pullRequest, main)).toStrictEqual([
    'the jobs of preview-main.yml differ from the jobs of preview.yml',
  ]);
});
