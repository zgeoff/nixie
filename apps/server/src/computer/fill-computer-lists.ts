import { computerInboxKinds } from '@heynixie/connectors';
import type { ToolShape } from '@heynixie/policy';
import { toolShapes } from '@heynixie/policy';
import { inboxKinds } from '@heynixie/tasks';

// A command that a rule reads as a syntax tree, and the screen acts, which share one rule so that an
// answer on a site covers a click and a type there. The rule pins nothing but the host.
export const computerToolShapes: readonly ToolShape[] = [
  { kind: 'command', tool: 'computer.run', argument: 'command' },
  {
    kind: 'destination',
    name: 'computer-screen-acts',
    tools: ['computer.screen_click', 'computer.screen_type'],
  },
];

interface ComputerListsConfig {
  readonly computer?: unknown;
}

// Fills the core lists that the computer adds to, and empties them when it is off. It runs before
// any part starts, because the log's projections read the lists from the first record.
export function fillComputerLists(config: ComputerListsConfig): void {
  const isOn = config.computer !== undefined;
  const kinds = isOn ? computerInboxKinds : [];
  const shapes = isOn ? computerToolShapes : [];

  inboxKinds.set(kinds);
  toolShapes.set(shapes);
}
