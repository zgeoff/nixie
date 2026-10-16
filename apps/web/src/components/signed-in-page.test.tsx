import { expect, mock, test } from 'bun:test';
import { render } from '../test-utils/render';
import { SignedInPage } from './signed-in-page';

test('it shows the page to a live session', () => {
  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="live">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(rendered.getByText('Stub page')).toBeVisible();
});

test('it shows the enrolment form in place of the page when the session is refused', () => {
  const rendered = render(
    <SignedInPage onRefresh={() => {}} session="none">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(rendered.getByRole('heading', { name: 'Enrol this browser' })).toBeVisible();
  expect(rendered.queryByText('Stub page')).toBeNull();
});

test('it reads the page again with the browser cookie when the server render was refused', () => {
  const onRefresh = mock<() => void>();

  const rendered = render(
    <SignedInPage onRefresh={onRefresh} session="unchecked">
      <p>Stub page</p>
    </SignedInPage>,
  );

  expect(onRefresh).toHaveBeenCalledOnce();
  expect(rendered.queryByText('Stub page')).toBeNull();
});
