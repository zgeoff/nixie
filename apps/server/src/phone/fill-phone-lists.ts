import { phoneSourceID } from '@heynixie/phone';
import { textSources } from '@heynixie/triggers';

interface PhoneListsConfig {
  readonly phone?: unknown;
}

// Fills the list of text sources that the wake rules accept, and empties it when the phone is off.
// It runs before any part starts, because the log's projections read the list from the first record.
export function fillPhoneLists(config: PhoneListsConfig): void {
  const sources = config.phone === undefined ? [] : [phoneSourceID];

  textSources.set(sources);
}
