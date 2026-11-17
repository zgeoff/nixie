import { expect, test } from 'bun:test';
import { formatEnvelopeLabel } from './format-envelope-label';

test('#formatEnvelopeLabel fills the id slot with the task ID', () => {
  const label = formatEnvelopeLabel(
    'task: {name} ({id})',
    { agentName: null, ownerName: null },
    'Sweeper',
    'k3vq8m2xpa',
  );

  expect(label).toBe('task: Sweeper (k3vq8m2xpa)');
});

test('#formatEnvelopeLabel keeps a slot that the name holds as text', () => {
  const label = formatEnvelopeLabel(
    'task: {name} ({id})',
    { agentName: 'Pip', ownerName: 'Robin' },
    'Ask {owner} about {id} for {agent}',
    'k3vq8m2xpa',
  );

  expect(label).toBe('task: Ask {owner} about {id} for {agent} (k3vq8m2xpa)');
});
