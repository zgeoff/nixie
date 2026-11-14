import type { SandboxAdapter } from '@heynixie/sandbox';

const destroyFailedMessage =
  'nixie could not destroy a code sandbox that holds this text. Try the forget again.';

export class CodeSandboxDestroyError extends Error {
  constructor() {
    super(destroyFailedMessage);

    this.name = 'CodeSandboxDestroyError';
  }
}

export const codeRunOwnerPrefix = 'code_run:';

// Destroys every code sandbox of the given calls, a running one included, before a forget deletes
// the key of a record that holds the call's text.
export async function destroyCodeRunSandboxes(
  adapter: Pick<SandboxAdapter, 'list'>,
  callIDs: readonly string[],
): Promise<void> {
  try {
    const listed = await Promise.all(
      callIDs.map((callID) => adapter.list(`${codeRunOwnerPrefix}${callID}`)),
    );

    await Promise.all(listed.flat().map((sandbox) => sandbox.destroy()));
  } catch {
    throw new CodeSandboxDestroyError();
  }
}
