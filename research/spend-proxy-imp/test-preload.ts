// The spike's runner tests answer the preview's API with the web client's mock of nixie's API, which
// holds the records and tasks in a store that each test seeds.
import { afterEach } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { handlers } from '../../apps/web/src/mocks/handlers.ts';
// @boundaries-ignore a spike imports the code it measures
import { store } from '../../apps/web/src/mocks/store.ts';
// @boundaries-ignore a spike imports the code it measures
import { addMockHandlers } from '../../libs/mock-server/src/index.ts';

addMockHandlers(...handlers);

afterEach(() => {
  store.reset();
});
