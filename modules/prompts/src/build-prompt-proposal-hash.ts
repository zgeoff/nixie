import type { PromptID, PromptPartFile } from './types';

export interface HashedPromptProposal {
  readonly promptID: PromptID;
  readonly entry: Readonly<Record<string, string>>;
  readonly files: readonly PromptPartFile[];
}

export function buildPromptProposalHash(proposal: HashedPromptProposal): string {
  const entry = Object.entries(proposal.entry).toSorted(([left], [right]) =>
    left < right ? -1 : 1,
  );

  const files = proposal.files
    .map((file) => [file.path, file.text])
    .toSorted(([left = ''], [right = '']) => (left < right ? -1 : 1));

  return new Bun.CryptoHasher('sha256')
    .update(JSON.stringify([proposal.promptID, entry, files]))
    .digest('hex');
}
