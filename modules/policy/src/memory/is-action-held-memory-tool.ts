// A memory tool that moves many items in one call. It declares memory_write, so the same rules
// match it as match memory.edit, but a call that no allow rule covers waits for the user as an
// action proposal, which shows one card for the whole call, and no memory proposal holds it.
export function isActionHeldMemoryTool(tool: string): boolean {
  return tool === 'memory.retopic';
}
