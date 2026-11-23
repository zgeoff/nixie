import type { Page } from 'playwright-core';

// Hosts of the frames that a CAPTCHA or human check loads, each with the path its challenge frame
// lives under, when the host serves more than the challenge.
const challengeFrames: readonly { readonly host: string; readonly pathPrefix: string }[] = [
  { host: 'google.com', pathPrefix: '/recaptcha/' },
  { host: 'recaptcha.net', pathPrefix: '/recaptcha/' },
  { host: 'hcaptcha.com', pathPrefix: '/' },
  { host: 'challenges.cloudflare.com', pathPrefix: '/' },
  { host: 'arkoselabs.com', pathPrefix: '/' },
  { host: 'funcaptcha.com', pathPrefix: '/' },
];

// The widget and interstitial markers that a challenge puts in a page: its containers by class or
// ID. The check reads no text, so a site cannot write words that pass for a challenge.
const challengeSelector = [
  '.g-recaptcha',
  '.h-captcha',
  '.cf-turnstile',
  '#cf-challenge-running',
  '#challenge-running',
  '#challenge-stage',
  '#challenge-form',
  '#cf-chl-widget',
  '#FunCaptcha',
  '[data-arkose-public-key]',
].join(',');

// Whether the address of a frame is that of a known challenge: the host or a subdomain of it, and a
// path under the host's challenge prefix.
export function isChallengeFrameURL(address: string): boolean {
  if (!URL.canParse(address)) {
    return false;
  }

  const url = new URL(address);

  return challengeFrames.some(
    (frame) =>
      (url.hostname === frame.host || url.hostname.endsWith(`.${frame.host}`)) &&
      url.pathname.startsWith(frame.pathPrefix),
  );
}

// One cheap look at a tab for a CAPTCHA or human check: its frames' addresses and its markers.
// A page that is mid-navigation, or closed, counts as having none.
export async function probeChallenge(page: Page): Promise<boolean> {
  try {
    if (page.frames().some((frame) => isChallengeFrameURL(frame.url()))) {
      return true;
    }

    return (await page.locator(challengeSelector).count()) > 0;
  } catch {
    return false;
  }
}
