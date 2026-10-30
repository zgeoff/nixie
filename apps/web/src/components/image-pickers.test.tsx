import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { render } from '../test-utils/render';
import { ImagePickers } from './image-pickers';

test('it renders both pickers disabled on the server, before React can take a pick', () => {
  const markup = renderToString(<ImagePickers onPick={() => {}} />);

  expect(markup.match(/<input[^>]*disabled=""/gu)).toHaveLength(2);
});

test('it enables both pickers once the page runs in the browser', () => {
  const rendered = render(<ImagePickers onPick={() => {}} />);

  expect(rendered.getByLabelText('Camera')).toBeEnabled();
  expect(rendered.getByLabelText('Photos')).toBeEnabled();
});
