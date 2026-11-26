// How the policy reads the tools of one feature. A shape of a command tool says which argument holds
// a command line, which a rule reads as a syntax tree. A shape of a destination tool says which
// tools share one always-allow rule that pins only the destination.
export type ToolShape =
  | { readonly kind: 'command'; readonly tool: string; readonly argument: string }
  | { readonly kind: 'destination'; readonly name: string; readonly tools: readonly string[] };

let current: readonly ToolShape[] = [];

// The server sets the list at the start of each server, before any part starts. A feature that is
// off adds none.
export const toolShapes = {
  set: (next: readonly ToolShape[]): void => {
    current = next;
  },
  list: (): readonly ToolShape[] => current,
};
