# 0019: Each deployment registers its own OAuth clients

- Date: 2026-10-08
- Status: decided

## Decision

Each deployment registers its own OAuth clients with each provider, and nixie ships no central OAuth
app.

## Why

- nixie is self-hosted. A central app would put the project between every deployment and its data,
  and Google would require a Cloud Application Security Assessment for it, renewed at least every 12
  months
  ([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
- Google's personal-use exception, for fewer than 100 users, lets an unverified app in production
  run with no review
  ([exceptions to verification](https://support.google.com/cloud/answer/13464323)). Testing mode
  forces a fresh consent every 7 days.
- In the [Google OAuth spike](../../research/google-oauth/), an unverified client in production
  obtained `gmail.modify`, a restricted scope, with no warning page, and called Gmail, Calendar and
  Drive.

## Rejected alternatives

| Option                    | Why not                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a central nixie OAuth app | Setup is easier, and the project becomes a processor of every deployment's data.                                                                                                       |
| IMAP with an app password | It needs no OAuth client and gives cruder access. Google offers no app password under Advanced Protection, with security-key-only 2-Step Verification, or on a work or school account. |

## Consequences

- Setting up a connector includes registering a client with the provider, so the setup guide and the
  client walk you through it.
- Microsoft Graph needs a free Azure account for an app registration. iCloud works only with an
  app-specific password, and its Reminders and Notes have no third-party route.
