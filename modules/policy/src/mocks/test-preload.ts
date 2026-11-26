import { afterEach, beforeEach } from 'bun:test';
import { toolShapes } from '../utils/tool-shapes';

// The policy reads a command tool and a screen tool by the shapes that a server sets at start. A
// test of the starter rules and of always-allow rules reads the tools of a computer, so each test
// starts with those shapes and ends with none.
beforeEach(() => {
  toolShapes.set([
    { kind: 'command', tool: 'computer.run', argument: 'command' },
    {
      kind: 'destination',
      name: 'computer-screen-acts',
      tools: ['computer.screen_click', 'computer.screen_type'],
    },
  ]);
});

afterEach(() => {
  toolShapes.set([]);
});
