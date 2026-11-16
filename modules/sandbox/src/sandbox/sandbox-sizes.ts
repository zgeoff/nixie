import type { SandboxLimits } from '../types';

// The only place in product code that holds a sandbox's memory figure. A row belongs to a role, and
// no sandbox kind or image picks one.
export const sandboxSizes = {
  conversation: { vcpus: 2, memoryMiB: 512, diskMiB: 4096 },
  systemTask: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
  fetch: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 },
  codeRun: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },

  // The Codex CLI and its guest run one turn here. The figure is the system task's, and no probe
  // has measured it on the codex image yet.
  codexTask: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
} as const satisfies Readonly<Record<string, SandboxLimits>>;

export type SandboxSizeRow = keyof typeof sandboxSizes;
