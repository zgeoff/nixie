import { expect, test } from 'bun:test';
import { formatRouteNotice } from './format-route-notice';

test.each([
  {
    name: 'with no display currency',
    display: null,
    sentence:
      'Model spending paused on plan: its daily limit of $40.00 was reached. Work on that route waits and nothing is lost. Other routes go on. It resumes on its own at midnight.',
  },
  {
    name: 'with a display currency',
    display: { currency: 'AUD', rate: 1.5 },
    sentence:
      'Model spending paused on plan: its daily limit of $40.00 (about A$60) was reached. Work on that route waits and nothing is lost. Other routes go on. It resumes on its own at midnight.',
  },
])('it names the route that waits and its limit in US dollars $name', (row) => {
  const notice = formatRouteNotice(
    {
      route: 'plan',
      period: 'day',
      start: '2026-11-13',
      limit: 40,
      spent: 41.2,
      at: new Date('2026-11-13T16:42:07Z'),
      resetsAt: new Date('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 80,
    },
    row.display,
  );

  expect(notice).toBe(row.sentence);
});
