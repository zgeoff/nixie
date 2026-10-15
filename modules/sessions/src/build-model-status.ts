import type { StatusEntry } from './build-status-registry';

// The status entry for the model from the conversation's profile, so the model can name itself.
export function buildModelStatus(): StatusEntry {
  return {
    name: 'model',
    read: (facts) => Promise.resolve({ value: facts.model, text: `Model: ${facts.model}` }),
  };
}
