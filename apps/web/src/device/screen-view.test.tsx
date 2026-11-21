import { expect, test } from 'bun:test';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ScreenView } from './screen-view';

test('it renders markdown on black', () => {
  const rendered = render(<ScreenView blocks={[{ kind: 'markdown', text: '# Saturday' }]} />);

  expect(rendered.getByRole('heading', { name: 'Saturday' })).toBeVisible();
});

test('it renders nothing for a screen with no blocks', () => {
  const rendered = render(<ScreenView blocks={[]} />);

  expect(rendered.getByTestId('screen')).toBeEmptyDOMElement();
});

test.each(['whole', 'fill'] as const)('it fits an image with the fit %s', async (fit) => {
  await createDeviceSession();

  const rendered = render(<ScreenView blocks={[{ kind: 'image', image: 'k3x9m2p7qa', fit }]} />);

  const picture = await rendered.findByRole('presentation');

  expect(picture).toHaveAttribute('data-fit', fit);
});
