# Spike results: a personal Google OAuth client, unverified, in production

Decision [0019](../../docs/decisions/0019-connector-authorization.md) has each owner register their
own OAuth client. This spike checks whether an unverified client in production can hold Gmail's
restricted scope, and whether its refresh token outlives the 7-day limit of testing mode.

## Question

Can an owner's own Google Cloud project, published to production without verification, consent to
full Gmail access and keep a working refresh token past 7 days? What does setup need?

## Setup

- Bun 1.4.2, no dependencies
- Google OAuth 2.0 for installed apps, with a loopback redirect and PKCE
- Scopes: `gmail.modify` (restricted), `calendar.events` and `drive.file`

Both scripts read the OAuth client and the refresh token from a 1Password vault named `nixie`,
through a service-account token with access to that vault in `OP_SERVICE_ACCOUNT_TOKEN`. Neither
prints a secret. `consent.ts` runs once: it prints the consent URL and stores the refresh token as
`google-refresh-token`. `refresh.ts` runs any time later: it refreshes the token and calls each API
once.

`consent.ts` listens on `127.0.0.1:8765` for the redirect. From WSL, a browser on the Windows host
reached it with no extra setup.

### Setup the owner did

1. Created a Google Cloud project and enabled the Gmail, Calendar and Drive APIs.
2. Configured the consent screen as External, with an app name and the owner's email.
3. Publishing to production required a home page URL and a privacy policy URL on the Branding page.
   The project's GitHub Pages site served both.
4. Published the app to production with no test users, and created a Desktop app client.

## Answer

| Check                                  | Result                                       |
| -------------------------------------- | -------------------------------------------- |
| Consent to `gmail.modify`, unverified  | Granted, with all 3 scopes                   |
| "Google hasn't verified this app" page | Not shown to the owner, who owns the project |
| Refresh on day 0                       | HTTP 200                                     |
| Gmail, Calendar and Drive calls        | HTTP 200 each, once each API was enabled     |
| Refresh on day 8                       | HTTP 200, and HTTP 200 from each API         |

- A production app with no test users keeps a working refresh token past testing mode's 7-day limit,
  and needs no Google Cloud setup beyond the 4 steps in [Setup the owner did](#setup-the-owner-did).
  The script writes nothing back to the vault, so the token that refreshed on day 8 is the one that
  consent issued on day 0.
- An unverified production app can hold Gmail's restricted scope for its owner. The third-party
  reports that Google blocks unverified apps from restricted scopes did not hold for the project's
  own account.
- Publishing to production needs a home page and a privacy policy URL, so the setup guide for owners
  includes them.
- The warning page did not appear, most likely because the consenting account owns the project. This
  is observed, not confirmed by a Google page.

## Untested

- Consent from an account that does not own the project, which would see the warning page.
- Whether Google later asks the app for verification, or caps it, as usage grows.
