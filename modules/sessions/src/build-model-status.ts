import type { StatusEntry } from './build-status-registry';

export function buildModelStatus(): StatusEntry {
  return {
    name: 'model',
    read: (facts) => Promise.resolve({ value: facts.model, text: `Model: ${facts.model}` }),
  };
}
