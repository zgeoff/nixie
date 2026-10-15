import { expect, test } from 'bun:test';
import { render } from '../test-utils/render';
import { ReplyText } from './reply-text';

test('it renders bold, lists, links and code blocks', () => {
  const rendered = render(
    <ReplyText
      text={[
        'The **front pages** today:',
        '',
        '- [The Verge](https://www.theverge.com/)',
        '- Ars Technica',
        '',
        '```ts',
        'const answer = 42;',
        '```',
      ].join('\n')}
    />,
  );

  expect(rendered.getByText('front pages').tagName).toBe('STRONG');

  expect(rendered.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
    'The Verge',
    'Ars Technica',
  ]);

  expect(rendered.getByRole('link', { name: 'The Verge' })).toHaveAttribute(
    'href',
    'https://www.theverge.com/',
  );

  expect(rendered.getByText('const answer = 42;').closest('pre')).not.toBeNull();
});

test('it opens a link in a new tab with no opener and no referrer', () => {
  const rendered = render(<ReplyText text="See [the page](https://example.com/)." />);
  const link = rendered.getByRole('link', { name: 'the page' });

  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('it links a footnote and its way back to anchors that exist, in the same page', () => {
  const rendered = render(<ReplyText text={'Claim[^1].\n\n[^1]: Source.'} />);
  const reference = rendered.getByRole('link', { name: '1' });
  const back = rendered.getByRole('link', { name: /^Back to reference 1/u });
  const note = rendered.container.querySelector(reference.getAttribute('href') ?? 'missing');
  const origin = rendered.container.querySelector(back.getAttribute('href') ?? 'missing');

  expect(note).toHaveTextContent('Source.');
  expect(origin).toBe(reference);
  expect(reference).not.toHaveAttribute('target');
  expect(back).not.toHaveAttribute('target');
});

test('it renders the raw HTML in a reply inert', () => {
  const rendered = render(
    <ReplyText
      text={[
        'Quoted from the page:',
        '',
        '<script>globalThis.ran = true</script>',
        '<img src="https://tracker.test/pixel.gif" onerror="globalThis.ran = true">',
        '<iframe src="https://evil.test/"></iframe>',
        'Some <b onclick="globalThis.ran = true">bold</b> text.',
      ].join('\n')}
    />,
  );

  expect(rendered.getByText('Quoted from the page:')).toBeInTheDocument();

  expect(
    rendered.container.querySelector('script, img, iframe, b, [onerror], [onclick]'),
  ).toBeNull();
});

test.each([
  // oxlint-disable-next-line no-script-url -- the link a reply must not keep
  ['javascript:alert(1)'],

  // oxlint-disable-next-line no-script-url -- the same link in mixed case
  ['JaVaScRiPt:alert(1)'],
  ['javascript&#58;alert(1)'],
  ['data:text/html,<script>alert(1)</script>'],
  ['vbscript:msgbox(1)'],
])('it shows a link to %s as plain text', (url) => {
  const rendered = render(<ReplyText text={`[click me](${url}) now`} />);

  expect(rendered.getByText('click me').closest('a')).toBeNull();
});

test('it shows an image as a link to it, so the image never loads', () => {
  const rendered = render(<ReplyText text="![a chart](https://tracker.test/chart.png)" />);
  const link = rendered.getByRole('link', { name: 'image: a chart' });

  expect(link).toHaveAttribute('href', 'https://tracker.test/chart.png');
  expect(rendered.container.querySelector('img')).toBeNull();
});

test('it shows a linked image as one link to the outer link', () => {
  const rendered = render(
    <ReplyText text="[![a chart](https://example.com/chart.png)](https://example.com/report)" />,
  );

  const links = rendered.getAllByRole('link');

  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAccessibleName('image: a chart');
  expect(links[0]).toHaveAttribute('href', 'https://example.com/report');
  expect(rendered.container.querySelector('img')).toBeNull();
});
