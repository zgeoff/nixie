import type { CurrentNote } from '../note/plan-edit';

export function buildCurrentNote(overrides: Partial<CurrentNote> = {}): CurrentNote {
  return {
    shortID: 'n4w8k2c6rd',
    version: 2,
    title: 'Why the boiler keeps tripping',
    body: 'The trip happens after a cold night. Cold is cold.',
    tags: ['home', 'boiler'],
    isPrivate: false,
    ...overrides,
  };
}
