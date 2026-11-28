import type { PlaceActActivity } from './build-activity';

// "tickets.example.com: computer.browser_click ×2, mail.send": a tool that ran once shows no count.
export function formatPlaceAct(act: PlaceActActivity): string {
  const tools = act.tools.map((entry) =>
    entry.count === 1 ? entry.tool : `${entry.tool} ×${String(entry.count)}`,
  );

  return `${act.place}: ${tools.join(', ')}`;
}
