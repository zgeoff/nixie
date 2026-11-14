import type { ToolRun } from '@heynixie/tools';
import type { IsExempt, IsOwnerTyped } from './secret-scan';

interface TypedExemptionInputs {
  readonly isOwnerTyped: IsOwnerTyped;
  readonly run: ToolRun;

  // the URL before any rewrite
  readonly namedURL: string;
  readonly covers: 'named_url' | 'redirects';
}

// One exemption per call, for every rule. It reads the owner's messages at most once, and only
// when a scan asks after a match.
export function makeTypedExemption(inputs: TypedExemptionInputs): IsExempt {
  let typed: Promise<boolean> | null = null;

  const readTyped = (): Promise<boolean> => {
    typed ??= inputs.isOwnerTyped(inputs.run, inputs.namedURL);

    return typed;
  };

  return (hop) =>
    hop === 0 || inputs.covers === 'redirects' ? readTyped() : Promise.resolve(false);
}
