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

// The widget and interstitial markers of a challenge, by class or ID, never by text. The
// interstitial's form counts only with the Cloudflare token in its action: any site may name a form
// challenge-form.
const challengeSelector = [
  '.g-recaptcha',
  '.h-captcha',
  '.cf-turnstile',
  '#cf-challenge-running',
  '#cf-please-wait',
  'form#challenge-form[action*="__cf_chl"]',
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

    // every frame is searched, because a widget sits in a frame of the site's own while its
    // provider's frame has not loaded
    const counts = await Promise.all(
      page.frames().map((frame) =>
        frame
          .locator(challengeSelector)
          .count()
          .catch(() => 0),
      ),
    );

    return counts.some((count) => count > 0);
  } catch {
    return false;
  }
}
