import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The process sandbox points HOME at the sandbox's own folder, which holds no browser download, so
// the browser is looked up under the account's real home. Playwright reads the variable when it
// loads, so the guest loads after it is set.
const passwd = readFileSync('/etc/passwd', 'utf8').split('\n');
const entry = passwd.find((line) => line.split(':')[2] === String(process.getuid?.()));
const realHome = entry?.split(':')[5] ?? homedir();

process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= join(realHome, '.cache', 'ms-playwright');

await import('./main');
