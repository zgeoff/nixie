# 0019: Connector authorization

- Date: 2026-10-08
- Status: decided, amended by [0030](./0030-connectors-and-sandbox-environments.md)
- Research: [connector notes](../research/2.6-notes/connectors.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#connectors-and-mcp)

Each owner registers their own OAuth clients with each provider, and nixie ships no central OAuth
app. The credential store from [0016](./0016-own-interfaces.md) holds each owner's clients and
tokens.

The Google personal-use spike from the connector notes runs early, before Phase 3 designs the
connector interface. It registers an unverified production client with Gmail, Calendar and Drive
scopes, and refreshes its token over 8 days.

## Why

- nixie is self-hosted. A central app would put the project between every owner and their data, and
  Google would require a Cloud Application Security Assessment for it, renewed at least every 12
  months
  ([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification),
  2026-08-19).
- Google's personal-use exception, for fewer than 100 users, lets an unverified app in production
  run with no review
  ([exceptions to verification](https://support.google.com/cloud/answer/13464323), 2026-10-08).
  Testing mode forces a fresh consent every 7 days
  ([Manage App Audience](https://support.google.com/cloud/answer/15549945), 2026-10-08).
- Third parties report that Google blocks unverified apps from restricted scopes such as full Gmail
  access, and no Google page confirms it. Reading the owner's email is a core job, so the connector
  design waits on the answer.

## Alternatives

- **A central nixie OAuth app.** Setup is easier for an owner, and the project becomes a processor
  of every owner's data.
- **IMAP with an app password.** It needs no OAuth client and gives cruder access. Google offers no
  app password when 2-Step Verification uses security keys only, under Advanced Protection, or on a
  work or school account ([app passwords](https://support.google.com/accounts/answer/185833),
  2026-10-08). It is the fallback if Google blocks the restricted scopes.

## Consequences

- Setting up a connector includes registering a client with the provider, so the setup guide and the
  client walk the owner through it.
- Microsoft Graph needs a free Azure account for an app registration
  ([register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app),
  2026-05-14). iCloud works only with an app-specific password, and its Reminders and Notes have no
  third-party route.
