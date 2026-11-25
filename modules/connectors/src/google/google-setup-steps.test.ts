import { expect, test } from 'bun:test';
import { googleSetupSteps } from './google-setup-steps';

async function setupTest() {
  const guide = await Bun.file(
    new URL('../../../../docs/guides/google.md', import.meta.url),
  ).text();

  const sections = new Map<string, string>();

  for (const part of guide.split(/^## /mu).slice(1)) {
    const [title = '', ...body] = part.split('\n');

    sections.set(title.trim(), body.join('\n'));
  }

  return { sections };
}

test('it holds each step of the guide under the step title, in the order the steps come', async () => {
  const ctx = await setupTest();

  const guideTitles = [...ctx.sections.keys()].filter((title) =>
    googleSetupSteps.some((step) => step.title === title),
  );

  expect(guideTitles).toStrictEqual(googleSetupSteps.map((step) => step.title));
});

test.each(
  googleSetupSteps.map((step) => [step.title, step.links.map((link) => link.url)] as const),
)('it links each address of the step "%s" in its section of the guide', async (title, urls) => {
  const ctx = await setupTest();

  const section = ctx.sections.get(title) ?? '';

  expect(urls.filter((url) => !section.includes(url))).toStrictEqual([]);
});
