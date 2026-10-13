import { expect, mock, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { render } from '../test-utils/render';
import { StepSection } from './step-section';

test('it shows its title and keeps its body closed until opened', () => {
  const rendered = render(
    <StepSection title="Tools 2">
      <p>two calls</p>
    </StepSection>,
  );

  expect(rendered.getByText('Tools 2')).toBeVisible();
  expect(rendered.getByText('two calls')).not.toBeVisible();
});

test('it says each time it opens and closes', async () => {
  const user = userEvent.setup();
  const onToggle = mock();
  const rendered = render(
    <StepSection
      onToggle={(isOpen) => {
        onToggle(isOpen);
      }}
      title="Step"
    >
      <p>task conversation</p>
    </StepSection>,
  );

  await user.click(rendered.getByText('Step'));
  await user.click(rendered.getByText('Step'));

  expect(onToggle.mock.calls).toStrictEqual([[true], [false]]);
});
