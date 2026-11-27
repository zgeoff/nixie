import type { TextSource } from '@heynixie/triggers';
import { readStoredText } from '../store/read-stored-text';
import { phoneSourceID } from './phone-source-id';

// The phone's entry in the core's list of text sources.
export const phoneTextSource: TextSource = {
  sourceID: phoneSourceID,
  readFields: readStoredText,
};
