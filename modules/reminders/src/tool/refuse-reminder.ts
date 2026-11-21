import type { ToolOutcome } from '@heynixie/tools';

// A refusal names the field it is about when it has one, and says how to fix it.
export function refuseReminder(code: string, sentence: string, path?: string): ToolOutcome {
  return {
    status: 'ok',
    result: { refused: { code, ...(path === undefined ? {} : { path }), sentence } },
    refusalCode: code,
  };
}
