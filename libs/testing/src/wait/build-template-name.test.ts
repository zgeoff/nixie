import { expect, test } from 'bun:test';
import { buildTemplateName } from './build-template-name';

test('it names the same template for the same checkout', () => {
  expect(buildTemplateName('orchard-build', '/srv/orchard')).toBe(
    buildTemplateName('orchard-build', '/srv/orchard'),
  );
});

test('it names another template for another checkout', () => {
  expect(buildTemplateName('orchard-build', '/srv/orchard')).not.toBe(
    buildTemplateName('orchard-build', '/srv/vineyard'),
  );
});

test('it starts the name with the template name', () => {
  expect(buildTemplateName('orchard-build', '/srv/orchard')).toStartWith('orchard-build-');
});
