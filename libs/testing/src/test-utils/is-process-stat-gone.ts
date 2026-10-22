// proc(5) puts the state after the name in parentheses, and the name can hold a ')' itself.
// The kernel shows X (dead) for a reaped task until it drops the task from /proc.
export function isProcessStatGone(stat: string): boolean {
  const state = stat.charAt(stat.lastIndexOf(')') + 2);

  return state === 'Z' || state === 'X';
}
