import { runLaneBuilds } from './run-lane-builds';

// The computer guest's tests drive a Playwright Chromium, which a CI runner lacks. A local host
// keeps the one it has, so only CI installs it.
export function installBrowserInCI(env: Readonly<Record<string, string | undefined>>): void {
  const ci = env['CI'];

  if (ci !== undefined && ci !== '') {
    runLaneBuilds(env, ['ci:install-browser']);
  }
}

if (import.meta.main) {
  installBrowserInCI(process.env);
}
