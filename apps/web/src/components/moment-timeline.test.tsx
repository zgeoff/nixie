import { expect, test } from 'bun:test';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { MomentTimeline } from './moment-timeline';

function setupTest() {
  const user = userEvent.setup();

  return { user };
}

test('it lists the active moments newest first, each linked to its view', async () => {
  await createDeviceSession();

  await store.moments.create({
    momentID: '0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
    title: 'The ladder on the stairs',
    keptAt: new Date('2026-10-01T09:00:00Z'),
  });

  await store.moments.create({
    title: 'The night the boiler gave out',
    keptAt: new Date('2026-10-05T21:00:00Z'),
  });

  const rendered = render(<MomentTimeline />);

  const list = await rendered.findByRole('list', { name: 'Moments' });

  expect(
    within(list)
      .getAllByRole('listitem')
      .map((entry) => entry.getAttribute('aria-label')),
  ).toStrictEqual(['The night the boiler gave out', 'The ladder on the stairs']);

  expect(within(list).getByRole('link', { name: 'The ladder on the stairs' })).toHaveAttribute(
    'href',
    '/moments/0c8b5f2e-1d3a-4e6b-9f7c-2a4d6e8b0c1d',
  );
});

test('it marks a moment kept by nixie and edited later with the date of its edit', async () => {
  await createDeviceSession();

  await store.moments.create({
    title: 'The ladder on the stairs',
    keptBy: 'model',
    keptAt: new Date('2026-10-01T09:00:00Z'),
    editedAt: new Date('2026-10-04T09:00:00Z'),
  });

  const rendered = render(<MomentTimeline />);

  const entry = await rendered.findByRole('listitem', { name: 'The ladder on the stairs' });

  expect(entry).toHaveTextContent(
    `Kept ${new Date('2026-10-01T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} by nixie · edited ${new Date('2026-10-04T09:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );
});

test('it shows retired moments only behind the filter', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.moments.create({ title: 'The ladder on the stairs' });
  await store.moments.create({ title: 'The old shed', state: 'retired' });

  const rendered = render(<MomentTimeline />);

  await rendered.findByRole('listitem', { name: 'The ladder on the stairs' });

  expect(rendered.queryByRole('listitem', { name: 'The old shed' })).toBeNull();

  await ctx.user.click(rendered.getByRole('checkbox', { name: 'Show retired moments' }));

  const retired = await rendered.findByRole('listitem', { name: 'The old shed' });

  expect(retired).toHaveTextContent('retired');
});

test('it narrows the timeline to the moments a keyword search finds', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.moments.create({
    title: 'The ladder on the stairs',
    note: { text: 'Never leave it on the landing.', writtenAt: new Date() },
  });

  await store.moments.create({ title: 'The night the boiler gave out' });

  const rendered = render(<MomentTimeline />);

  await rendered.findByRole('listitem', { name: 'The night the boiler gave out' });
  await ctx.user.type(rendered.getByRole('searchbox', { name: 'Search moments' }), 'landing');
  await ctx.user.click(rendered.getByRole('button', { name: 'Search' }));

  await waitFor(() => {
    expect(rendered.queryByRole('listitem', { name: 'The night the boiler gave out' })).toBeNull();
  });

  expect(
    within(rendered.getByRole('list', { name: 'Moments' }))
      .getAllByRole('listitem')
      .map((entry) => entry.getAttribute('aria-label')),
  ).toStrictEqual(['The ladder on the stairs']);
});

test('it says when no moment matches the search', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  await store.moments.create({ title: 'The ladder on the stairs' });

  const rendered = render(<MomentTimeline />);

  await rendered.findByRole('listitem', { name: 'The ladder on the stairs' });
  await ctx.user.type(rendered.getByRole('searchbox', { name: 'Search moments' }), 'kettle');
  await ctx.user.click(rendered.getByRole('button', { name: 'Search' }));

  const empty = await rendered.findByText('No moment matches the search.');

  expect(empty).toBeVisible();
});
