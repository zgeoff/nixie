import { onTestFinished } from 'bun:test';
import { definitionSections } from '../section/definition-sections';
import { buildStubSection } from './build-stub-section';

// Turns the stub section on for the test, and off when the test ends, as the server does for a
// feature that is on.
export function useStubSection(): void {
  definitionSections.set([buildStubSection()]);

  onTestFinished(() => {
    definitionSections.set([]);
  });
}
