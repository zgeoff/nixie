import type { ProgramResult } from '../run-program.ts';

export interface SummaryCommandIO {
  readonly runCommand: (argv: readonly string[]) => ProgramResult;
  readonly writeOutput: (text: string) => void;
  readonly writeError: (text: string) => void;
  readonly appendSummary: (text: string) => void;
}

// The step's log and its summary each get the command's output, as `tee -a` gives them.
export function runIntoSummary(argv: readonly string[], io: SummaryCommandIO): number {
  const result = io.runCommand(argv);

  io.writeOutput(result.stdout);
  io.writeError(result.stderr);
  io.appendSummary(result.stdout);

  return result.exitCode;
}
