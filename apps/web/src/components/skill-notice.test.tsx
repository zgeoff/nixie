import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { SkillNotice } from './skill-notice';

test('it names a new skill, its version and the rule that applied it', () => {
  const rendered = render(
    <SkillNotice
      notice={{
        name: 'kite-forecast',
        skillHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        isNew: true,
        ruleID: 'allow-skill-writes',
      }}
    />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'nixie saved the new skill kite-forecast, version a1b2c3d4e5f6, under your rule allow-skill-writes.',
  );
});

test('it names a new version of a skill in force', () => {
  const rendered = render(
    <SkillNotice
      notice={{
        name: 'kite-forecast',
        skillHash: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
        isNew: false,
        ruleID: 'allow-skill-writes',
      }}
    />,
  );

  expect(rendered.getByRole('note')).toHaveTextContent(
    'nixie saved a new version of the skill kite-forecast, version 0f1e2d3c4b5a, under your rule allow-skill-writes.',
  );
});
