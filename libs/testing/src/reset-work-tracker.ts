import { afterEach } from 'bun:test';
import { setWorkTracker } from '@heynixie/clock';

afterEach(() => {
  setWorkTracker(null);
});
