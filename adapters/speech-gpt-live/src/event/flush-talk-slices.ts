import { raiseSpeechEvent } from '../session/raise-speech-event';
import type { GPTLiveSession } from '../types';
import { joinSlices } from './join-slices';

// Raises the speech layer's own speech that no event holds yet as one `spoke` event.
export function flushTalkSlices(session: GPTLiveSession): void {
  const text = joinSlices(session.talkSlices);

  session.talkSlices = [];

  if (text !== '') {
    raiseSpeechEvent(session, { kind: 'spoke', text, heardChars: text.length });
  }
}
