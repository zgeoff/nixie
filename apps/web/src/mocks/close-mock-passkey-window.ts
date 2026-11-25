import { store } from './store';

// Ends the window of the last tap, as 10 minutes without one would.
export async function closeMockPasskeyWindow(): Promise<void> {
  for (const check of store.passkeyChecks.all()) {
    await store.passkeyChecks.update(check, {
      data(draft) {
        draft.isCovering = false;
      },
    });
  }
}
