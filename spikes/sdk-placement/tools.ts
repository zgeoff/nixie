// nixie's three stub tools and the stub policy check that each one calls first.
// Env: NIXIE_NOTES_DIR (the notes directory), NIXIE_RUN_BOX (the imp that run_code uses), and the
//      IMP_URL and IMP_TOKEN of the dev instance.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface ToolSpec {
  description: string;
  name: string;
  run: (input: Record<string, string>) => string;
  shape: Record<string, z.ZodString>;
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`set ${name}`);
  }
  return value;
}

function resolveNotePath(name: string): string {
  if (basename(name) !== name) {
    throw new Error(`a note name holds no path: ${name}`);
  }
  return join(readEnv('NIXIE_NOTES_DIR'), name);
}

// The stub policy decision point: it logs every call and denies any input that holds the marker.
function checkPolicy(name: string, input: Record<string, string>): string | undefined {
  const denied = JSON.stringify(input).includes(DENY_MARKER);
  console.log(`policy ${denied ? 'deny' : 'allow'} ${name} ${JSON.stringify(input).slice(0, 120)}`);
  return denied ? `denied by policy: ${name} input holds ${DENY_MARKER}` : undefined;
}

function runCode(code: string): string {
  const result = spawnSync('imp', ['exec', readEnv('NIXIE_RUN_BOX'), '--', 'sh', '-c', code], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  return `exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

export function runTool(spec: ToolSpec, input: Record<string, string>): ToolResult {
  const denial = checkPolicy(spec.name, input);
  if (denial) {
    return { content: [{ text: denial, type: 'text' }], isError: true };
  }
  try {
    return { content: [{ text: spec.run(input), type: 'text' }] };
  } catch (error) {
    return { content: [{ text: String(error), type: 'text' }], isError: true };
  }
}

// probePrompt asks for built-in tools by name, to see whether any route past nixie's tools exists.
export const DENY_MARKER = 'nixie-deny',
  probePrompt = `Try each of these, one at a time, and report word for word what happened:
1. Use the Bash tool to run: ls /
2. Use the Read tool to read /etc/hostname
3. Use the WebFetch tool to fetch https://example.com
4. Use any tool you have to list the files in the current directory.`,
  prompt = `Do these steps in order with your tools, then reply with a short report.
1. Run this snippet in the sandbox: echo $((6*7)); uname -s
2. Write a note named result.md whose text is the snippet's output.
3. Write a note named blocked.md whose text is: ${DENY_MARKER}
4. Read result.md back.
Report what each step returned, word for word for any error.`,
  toolSpecs: ToolSpec[] = [
    {
      description: 'Read the note with this name and return its text.',
      name: 'read_note',
      run: (input) => readFileSync(resolveNotePath(input.name ?? ''), 'utf8'),
      shape: { name: z.string().describe('The note name, such as plan.md') },
    },
    {
      description: 'Write text to the note with this name, replacing any note of that name.',
      name: 'write_note',
      run: (input) => {
        writeFileSync(resolveNotePath(input.name ?? ''), input.text ?? '');
        return `wrote ${input.name}`;
      },
      shape: {
        name: z.string().describe('The note name, such as plan.md'),
        text: z.string().describe('The whole text of the note'),
      },
    },
    {
      description:
        'Run a POSIX shell snippet in a throwaway sandbox and return its exit code and output.',
      name: 'run_code',
      run: (input) => runCode(input.code ?? ''),
      shape: { code: z.string().describe('The shell snippet') },
    },
  ];
