import { $ } from 'bun';
import { terminalMemoryLimitBytes } from '../../guests/computer/src/desktop/constants.ts';
import { sandboxSizes } from '../../modules/sandbox/src/sandbox/sandbox-sizes.ts';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { mediaProbe } from './media-probe.ts';

// The id of the `terminal` account, which runs the terminal and each `computer.run`. A test in
// guests/computer checks the Dockerfile against desktop-layout.ts.
const terminalID = '1002:1002';

// The computer image carries ffmpeg and ImageMagick, and the terminal's account runs both inside the
// limits of the computer's terminal: the memory its cgroup gives the terminal's processes, with no
// swap, and the sandbox row's vCPUs.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-computer-image.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const computer = getStepEnv(process.env, 'COMPUTER');
  const memory = `${String(terminalMemoryLimitBytes / (1024 * 1024))}m`;

  const result =
    await $`docker run --rm --network none --user ${terminalID} --memory ${memory} --memory-swap ${memory} --cpus ${String(sandboxSizes.computer.vcpus)} --entrypoint sh ${computer} -c ${mediaProbe}`
      .nothrow()
      .quiet();

  if (result.exitCode !== 0) {
    console.log(
      `::error::the terminal's account cannot run the computer image's media tools: ${result.stderr.toString().trim()}`,
    );

    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runCLI();
}
