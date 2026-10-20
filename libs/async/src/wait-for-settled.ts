// Waits for work to fulfil or reject, and resolves either way.
export async function waitForSettled(pending: Promise<unknown> | null): Promise<void> {
  try {
    await pending;
  } catch {
    // the caller that started the work reports its failure
  }
}
