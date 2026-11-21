import type { ToolOutcome } from '@heynixie/tools';

export function refuseReminder(code: string, sentence: string): ToolOutcome {
  return { status: 'ok', result: { refused: { code, sentence } }, refusalCode: code };
}
