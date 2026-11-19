// Why a preview's served commit cannot verify this tree, or null when it serves the tree's commit.
export function pickCommitRefusal(served: string, head: string): string | null {
  if (served.trim().toLowerCase() === head.trim().toLowerCase()) {
    return null;
  }

  return `the preview serves ${served.trim().slice(0, 12)}, and this tree is at ${head.trim().slice(0, 12)}`;
}
