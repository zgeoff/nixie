# Spike: a personal Google OAuth client, unverified, in production

Decision [0019](../../docs/decisions/0019-connector-authorization.md) has each owner register their
own OAuth client. This spike checks whether an unverified client in production can hold Gmail's
restricted scope, and whether its refresh token outlives the 7-day limit of testing mode.

## Question

Can an owner's own Google Cloud project, published to production without verification, consent to
full Gmail access and keep a working refresh token past 7 days? What does setup need?

## Answer

- Consent to `gmail.modify` succeeded on the unverified production app, with all 3 scopes.
- The refresh token refreshed with HTTP 200 on day 0 and again on day 8, past testing mode's 7-day
  limit, and each API returned HTTP 200.
- The "Google hasn't verified this app" page did not appear for the account that owns the project.
- Publishing to production needs a home page URL and a privacy policy URL, and no other Google Cloud
  setup beyond 4 steps.

Have each owner publish their own client to production with no test users.

## Run it

```bash
bun consent.ts   # once: prints the consent URL, stores the refresh token as google-refresh-token
bun refresh.ts   # any time later: refreshes the token and calls each API once
```

The [setup](results.md#setup) gives the vault the scripts read, the scopes and the owner's 4 setup
steps.

## Results

The [results](results.md) hold the table of checks and the reasons behind each answer.

## Untested

Consent from an account that does not own the project, and whether Google later asks for
verification. The [untested list](results.md#untested) gives both.
