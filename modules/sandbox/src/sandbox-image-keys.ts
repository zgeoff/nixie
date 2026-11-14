// This file imports nothing, because release scripts import it by relative path in a job that
// runs no install.
export const sandboxImageKeys = ['conversation', 'fetch'] as const;

export type SandboxImageKey = (typeof sandboxImageKeys)[number];

export interface SandboxImageRecord {
  // the registry package, such as nixie-fetch
  readonly repository: string;

  // from the repository root
  readonly dockerfile: string;
}

export const sandboxImageRecords: Readonly<Record<SandboxImageKey, SandboxImageRecord>> = {
  conversation: { repository: 'nixie-conversation', dockerfile: 'guests/conversation/Dockerfile' },
  fetch: { repository: 'nixie-fetch', dockerfile: 'guests/fetch/Dockerfile' },
};
