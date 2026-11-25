import { join } from 'node:path';
import { checkChromeVersion } from './check-chrome-version';
import { parseChromePin } from './parse-chrome-pin';

// Playwright's Chromium is the browser of the computer guest and the render guest. Its release
// names the Chrome build it installs, so a Playwright bump that moves the build fails here until
// chrome-pin.json moves with it.
const root = join(import.meta.dir, '..', '..');

const pinText = await Bun.file(join(root, 'chrome-pin.json')).text();

const pin = parseChromePin(pinText);

// Each guest resolves playwright-core from its own folder.
for (const guest of ['guests/computer', 'guests/render']) {
  const playwrightPath = Bun.resolveSync('playwright-core/package.json', join(root, guest));
  const browsersFile = Bun.file(join(playwrightPath, '..', 'browsers.json'));

  const browsers: unknown = await browsersFile.json();

  for (const name of ['chromium', 'chromium-headless-shell']) {
    checkChromeVersion(
      `${guest}'s playwright-core ${name}`,
      getBrowserVersion(browsers, name),
      pin.version,
    );
  }
}

process.stdout.write(`playwright-core installs Chrome ${pin.version}\n`);

function getBrowserVersion(releaseFile: unknown, name: string): string {
  if (typeof releaseFile !== 'object' || releaseFile === null || !('browsers' in releaseFile)) {
    return '';
  }

  const list: unknown = releaseFile.browsers;

  if (!Array.isArray(list)) {
    return '';
  }

  for (const item of list) {
    const entry: unknown = item;

    if (
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      entry.name === name &&
      'browserVersion' in entry &&
      typeof entry.browserVersion === 'string'
    ) {
      return entry.browserVersion;
    }
  }

  return '';
}
