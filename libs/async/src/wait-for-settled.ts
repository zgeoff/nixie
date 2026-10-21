export async function waitForSettled(pending: Promise<unknown> | null): Promise<void> {
  try {
    await pending;
  } catch {
    // The caller that started the work reports its failure.
  }
}
