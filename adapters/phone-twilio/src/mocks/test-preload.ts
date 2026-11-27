import { afterEach } from 'bun:test';
import { addMockHandlers } from '@heynixie/mock-server';
import { twilioHandlers } from './twilio-handlers';
import { twilioStore } from './twilio-store';

addMockHandlers(...twilioHandlers);

afterEach(() => {
  twilioStore.reset();
});
