import type { Sandbox } from '@heynixie/sandbox';
import { getCodeRunTracker } from './get-code-run-tracker';

export interface CodeSandboxLister {
  readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'destroy'>[]>;
}

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
// the key of a record that holds the call's text. A call whose sandbox is still being created is
// flagged first, and it destroys that sandbox on arrival without running anything in it.
export async function destroyCodeRunSandboxes(
  adapter: CodeSandboxLister,
  callIDs: readonly string[],
): Promise<void> {
  getCodeRunTracker(adapter).flagForgotten(callIDs);

  try {
    const listed = await Promise.all(
      callIDs.map((callID) => adapter.list(`${codeRunOwnerPrefix}${callID}`)),
    );

    await Promise.all(listed.flat().map((sandbox) => sandbox.destroy()));
  } catch {
    throw new CodeSandboxDestroyError();
  }
}
