import { display, screenAccount } from '../desktop/constants';

// Runs one tool against the display as the screen account, which owns the display. It runs in the
// sandbox's own network namespace, where the display's abstract socket is, and never in the
// terminal's namespace, which cannot reach the display.
export async function runScreenTool(argv: readonly string[]): Promise<string> {
  const child = Bun.spawn(
    [
      'setpriv',
      `--reuid=${String(screenAccount.uid)}`,
      `--regid=${String(screenAccount.gid)}`,
      '--clear-groups',
      '--',
      ...argv,
    ],
    {
      env: { DISPLAY: display, HOME: screenAccount.home, PATH: process.env['PATH'] ?? '' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${argv[0] ?? 'tool'} exited ${String(exitCode)}: ${stderr.trim()}`);
  }

  return stdout;
}
