// Builds the session options from the command line, the persona text and a local profile.
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { startProxy } from './proxy.ts';

type Mode = 'append' | 'replace';

interface Profile {
  authToken?: string;
  authTokenCommand?: string;
  baseUrl: string;
  env?: Record<string, string>;
  model: string;
}

export interface Settings {
  cwd: string;
  mode: Mode;
  model: string;
  persona: string;
  profile: string | undefined;
  tools: string[];
}

const here = import.meta.dir,
  tokens = new Map<string, string>();

function printStderr(data: string): void {
  for (const line of data.trimEnd().split('\n')) {
    console.error(`[stderr ${line}]`);
  }
}

export function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function parseArgs(argv: string[]): Settings {
  const mode = readFlag(argv, '--mode') ?? 'replace';
  if (mode !== 'replace' && mode !== 'append') {
    throw new Error('--mode must be replace or append');
  }
  return {
    // The model runs in an empty folder, so the preset prompt sees no repo or git status.
    cwd: mkdtempSync(join(tmpdir(), 'model-eval-')),
    mode,
    model: readFlag(argv, '--model') ?? '',
    persona: resolve(readFlag(argv, '--persona') ?? join(here, 'personas/example.md')),
    profile: readFlag(argv, '--profile'),
    tools: (readFlag(argv, '--tools') ?? '').split(',').filter(Boolean),
  };
}

function loadProfile(name: string): Profile {
  const path = join(here, 'profiles.local.json');
  if (!existsSync(path)) {
    throw new Error(`no ${path}; copy profiles.example.json and fill it in`);
  }
  return readProfile(path, name);
}

function readProfile(path: string, name: string): Profile {
  const profile = (JSON.parse(readFileSync(path, 'utf8')) as Record<string, Profile>)[name];
  if (!profile) {
    throw new Error(`no profile "${name}" in profiles.local.json`);
  }
  return profile;
}

// Runs the profile's key command once per process and keeps the key in memory only.
function readToken(profile: Profile): string {
  if (profile.authToken) {
    return profile.authToken;
  }
  const command = profile.authTokenCommand ?? '',
    token = tokens.get(command) ?? execSync(command, { encoding: 'utf8' }).trim();
  tokens.set(command, token);
  return token;
}

// The SDK replaces the child's environment, so pass only what it needs and one credential.
// A profile runs in bare mode, which drops the environment, model, and date reminders, and goes
// through the proxy, which drops the CLI's own system blocks.
function buildEnv(profile: Profile | undefined): Record<string, string> {
  const base = { HOME: process.env.HOME ?? '', PATH: process.env.PATH ?? '' };
  if (!profile) {
    return { ...base, CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '' };
  }
  return {
    ...base,
    CLAUDE_CODE_SIMPLE: '1',
    ...profile.env,
    ANTHROPIC_AUTH_TOKEN: readToken(profile),
    ANTHROPIC_BASE_URL: startProxy(profile.baseUrl),
  };
}

export function buildOptions(settings: Settings, persona: string): Options {
  const profile = settings.profile ? loadProfile(settings.profile) : undefined;
  return {
    allowedTools: settings.tools,
    cwd: settings.cwd,
    env: buildEnv(profile),
    includePartialMessages: true,
    model: settings.model || profile?.model || 'claude-sonnet-5-5',
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    stderr: printStderr,
    systemPrompt:
      settings.mode === 'replace'
        ? { prompt: persona, snapshot: false, type: 'custom' }
        : { append: persona, preset: 'claude_code', snapshot: false, type: 'preset' },
    tools: settings.tools,
  };
}
