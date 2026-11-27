import { onTestFinished } from 'bun:test';
import { startTestAPI } from '@heynixie/api/test-utils';
import { fillComputerLists } from '@heynixie/server';

// Starts the API of a nixie whose config has a computer section: the computer's inbox kinds and
// tool shapes fill the core lists, and the API reports the computer as on. The lists empty when the
// test ends.
export function startTestComputer() {
  onTestFinished(() => {
    fillComputerLists({});
  });

  fillComputerLists({ computer: {} });

  return startTestAPI(undefined, { features: ['computer'] });
}
