import { expect, test } from 'bun:test';
import { formatPlaceAct } from './format-place-act';

test('it names the place and each tool, with a count for a tool that ran more than once', () => {
  expect(
    formatPlaceAct({
      place: 'tickets.example.com',
      tools: [
        { tool: 'computer.browser_click', count: 2 },
        { tool: 'mail.send', count: 1 },
      ],
    }),
  ).toBe('tickets.example.com: computer.browser_click ×2, mail.send');
});
