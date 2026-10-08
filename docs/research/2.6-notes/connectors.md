# Connector authorization and search providers

Report: 2.6

Sources were fetched on 2026-10-08 unless a different date is given with the source. Dates in
brackets are the "last updated" dates the pages showed; Google and Apple support pages show none.

A personal deployment can reach Gmail, Google Calendar and Google Drive without Google's
verification or a security assessment. The owner registers an OAuth client in their own Google Cloud
project, publishes it to production unverified, and clicks through the "unverified app" screen;
Google's exceptions page covers an app for personal use with fewer than 100 users. Leaving the app
in testing status instead costs a fresh consent every 7 days, because Google expires a test user's
refresh token after 7 days. Microsoft Graph needs a free Azure account for an app registration, and
delegated mail, calendar and file scopes need no admin consent for a personal account. Apple offers
no public OAuth for iCloud, so IMAP, CalDAV and CardDAV run on an app-specific password, and
Reminders and Notes have no third-party protocol. For search under
[decision 0005](../../decisions/0005-effects-and-taint.md), every provider returns titles and
snippets copied from web pages, so only some fields of a search result are typed in the sense that
the decision needs.

## Google

### Scope classes

Google sorts scopes into non-sensitive, sensitive and restricted. Restricted scopes need
verification and, for an app whose server stores or moves the data, an annual security assessment.

| Service  | Non-sensitive                                  | Sensitive                         | Restricted                                                                                                | Source                                                                                                                                                 |
| -------- | ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gmail    | `gmail.labels`, add-on compose and action      | `gmail.send`, add-on message read | `https://mail.google.com/`, `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.metadata`, settings | [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) [2026-09-10]                                                             |
| Drive    | `drive.file`, `drive.appdata`, `drive.install` | `drive.apps.readonly`             | `drive`, `drive.readonly`, `drive.metadata`, activity scopes                                              | [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) [2026-09-03]                                                |
| Calendar | Not published per scope                        | Reading events, as an example     | None found                                                                                                | [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) [2026-08-19] |

Any useful Gmail access is restricted: reading mail needs `gmail.readonly` or `gmail.modify`, and
IMAP over OAuth needs `https://mail.google.com/`
([Gmail XOAUTH2](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol) [2026-09-15]).
`drive.file` reaches only the files the owner picks or the app creates, and stays non-sensitive. The
Calendar scope page lists 20 scopes without a class, and the sensitive-scope page uses reading
calendar events as its example, so Calendar scopes are probably sensitive
([Calendar scopes](https://developers.google.com/workspace/calendar/api/auth) [2026-09-03]).

### Publishing status

An OAuth client in testing status serves up to 100 listed test users, shows them a warning, and
expires their consent after 7 days. Google's audience page states that a refresh token for offline
access "will also expire" with that consent, unless the app asks only for name, email and profile
([Manage App Audience](https://support.google.com/cloud/answer/15549945);
[OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2) [2026-05-26]). A test
user can grant the project's scopes, restricted ones included by the notes' reading, because
Google's verification pages exempt apps in testing. For nixie, testing status means the owner
consents again every week.

An app in production but unverified shows an "unverified app" screen and has a lifetime cap of 100
new users across the whole project, which Google cannot reset
([verification FAQ](https://support.google.com/cloud/answer/13463817);
[unverified apps](https://support.google.com/cloud/answer/7454865)). Its refresh tokens follow the
production rules: they lapse after 6 months unused, on a password change when they hold Gmail
scopes, or when an account passes 100 refresh tokens for one client
([OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2)).

Google's exceptions page covers a personal deployment: "If the app is for your personal use (fewer
than 100 users), you and your limited number of users can continue using the app without going
through verification"
([exceptions to verification](https://support.google.com/cloud/answer/13464323)). The
restricted-scope page gives the same case, an app whose users are all known personally to the
developer
([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
[2026-08-19]). No Google page says that an unverified production app with restricted scopes is
blocked outright, but third-party support posts report "This app is blocked" errors, so the
exception needs a test against a real account.

The Internal user type removes the screen and the cap, but it needs a project owned by a Google
Cloud organization ([exceptions to verification](https://support.google.com/cloud/answer/13464323)).
A consumer `@gmail.com` account has no organization, so Internal fits only an owner with Google
Workspace.

### Security assessment

Verification of a restricted scope requires a Cloud Application Security Assessment (CASA) from an
authorized lab when the app's server can read the data, renewed at least every 12 months
([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification);
[CASA tiering](https://appdefensealliance.dev/casa/casa-tiering) [2026-06-27]). Google sets the
assurance level, AL1 or AL2. Leviathan lists AL1 at $3,000 to $6,000
([Leviathan](https://leviathansecurity.com/programs/google-casa-cloud-application-security-assessment)),
and a 2024 comparison lists TAC Security at $540 for the older Tier 2
([Switch Labs](https://www.switchlabs.dev/post/casa-tier-2-tier-3-security-review-providers-pricing-and-the-cheapest-option)).
The assessment applies to whoever publishes a verified client. A shared nixie client that every
owner uses would need it, and each owner's own client under the personal-use exception does not.

### Without OAuth

Gmail still accepts an app password over IMAP and SMTP for a consumer account with 2-Step
Verification ([app passwords](https://support.google.com/accounts/answer/185833)). Google offers no
app password when 2-Step Verification uses security keys only, under Advanced Protection, or on a
work or school account, and advises against app passwords. For Workspace, Google turned off basic
authentication for IMAP, SMTP, CalDAV and CardDAV during 2024 and 2025, keeping app passwords as the
one exception
([Workspace transition](https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth)
[2026-10-07]). The three end dates on Google's timeline post differ, and the notes did not reconcile
them
([Workspace Updates](https://workspaceupdates.googleblog.com/2023/09/winding-down-google-sync-and-less-secure-apps-support.html)).

An app password reaches mail only. Google's CalDAV endpoint answers basic authentication with 401
and needs OAuth ([CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)
[2026-09-03]), so Calendar and Drive need an OAuth client whatever mail uses. An app password also
grants the whole mailbox, with no scope and no expiry until the owner revokes it.

### Push

Gmail push sends a notification to a Google Cloud Pub/Sub topic, and the owner grants publish rights
to `gmail-api-push@system.gserviceaccount.com`
([Gmail push](https://developers.google.com/workspace/gmail/api/guides/push) [2026-09-15]). A client
renews the watch at least once every 7 days, and Google drops events past 1 per second per user. A
pull subscription needs no public endpoint, and a push subscription needs a publicly addressable
server ([Pub/Sub push](https://docs.cloud.google.com/pubsub/docs/push) [2026-10-06]). IMAP IDLE is
the alternative without Pub/Sub, and RFC 2177 tells clients to re-issue it at least every 29 minutes
([RFC 2177](https://www.rfc-editor.org/rfc/rfc2177.txt)).

## Microsoft Graph

Registering an app needs a Microsoft Entra tenant, and a free Azure account comes with a Default
Directory that serves
([register an app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
[2026-05-14];
[create a tenant](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-create-new-tenant)
[2025-04-16]). The app's `signInAudience` decides which accounts sign in: `PersonalMicrosoftAccount`
for Outlook.com and personal OneDrive, or `AzureADandPersonalMicrosoftAccount` for both kinds. A
personal-account audience allows 2 client secrets and 30 permissions per resource
([supported accounts](https://learn.microsoft.com/en-us/entra/identity-platform/supported-accounts-validation)
[2026-09-25]).

Delegated `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite` and
`offline_access` need no admin consent and work for personal accounts; their application-only forms
need admin consent
([permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
[2026-09-14]). Since November 2020, users in other tenants often cannot consent to an unverified
multitenant app, and publisher verification needs a Partner One ID and a custom domain. An app
registered with a Microsoft account cannot be publisher-verified at all
([publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
[2026-06-15]). For a work account, the owner registers the app in their own tenant, where the
default consent policy allows apps registered in the same tenant
([user consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
[2025-06-15]). Whether step-up consent affects personal accounts, the notes did not find.

Refresh tokens last 90 days and replace themselves on every use, so a connector that refreshes at
least every 90 days keeps access
([refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
[2025-11-05]).

Graph change notifications need a public HTTPS endpoint that echoes a validation token within 10
seconds and acknowledges each delivery within 3 seconds
([webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
[2025-01-15]). A mail, event or contact subscription lasts at most 10,080 minutes, about 7 days
([subscription](https://learn.microsoft.com/en-us/graph/api/resources/subscription) [2026-09-17]).
Event Hubs delivery needs no public URL but needs an Azure subscription, and delta queries poll for
changes with no endpoint at all
([delta query](https://learn.microsoft.com/en-us/graph/delta-query-overview) [2025-01-15]).

Outlook.com has required OAuth for IMAP, POP and SMTP since 16 September 2024
([Outlook.com basic auth](https://support.microsoft.com/en-us/topic/c5d65390-9676-4763-b41f-d7986499a90d)).
IMAP over OAuth uses the scopes `IMAP.AccessAsUser.All` and `SMTP.Send` with XOAUTH2, for both
Microsoft 365 and Outlook.com
([IMAP OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)
[2025-10-17]). Exchange Online turns SMTP AUTH with basic authentication off by default for existing
tenants at the end of December 2026, and admins can still turn it back on
([Exchange blog](https://techcommunity.microsoft.com/blog/exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835)
[2026-01-27]).

## Apple iCloud

Apple publishes no OAuth for iCloud Mail, Calendar or Contacts to developers. Since October 2025,
Apple lets approved third-party apps sign in with the Apple Account for mail, calendar and contacts,
and Outlook uses it, but the notes found no public program or scope list
([iCloud in third-party apps](https://support.apple.com/en-us/121539) [2025-10-07]). Sign in with
Apple carries only `name` and `email`.

Every other client uses an app-specific password. Apple requires two-factor authentication, allows
25 active passwords, and revokes them all when the owner changes the Apple Account password
([app-specific passwords](https://support.apple.com/en-us/102654) [2025-10-08]). Mail runs on
`imap.mail.me.com:993` and `smtp.mail.me.com:587`
([mail settings](https://support.apple.com/en-us/102525) [2026-02-03]). Apple does not document its
CalDAV and CardDAV servers; clients such as DAVx5 use them with an app-specific password
([DAVx5](https://www.davx5.com/tested-with/icloud)), and one unanswered forum post from September
2026 reports CardDAV refusing a fresh password
([Apple forums](https://developer.apple.com/forums/thread/845152)).

Reminders and Notes have no third-party route. DAVx5 reports that Apple disabled Reminders sync over
CalDAV for upgraded reminders, and Notes has no API. Advanced Data Protection encrypts Notes and
Reminders end to end but leaves mail, contacts and calendars on standard protocols, because those
protocols have no built-in end-to-end encryption
([Advanced Data Protection](https://support.apple.com/en-us/102651) [2026-01-05]).

## IMAP, SMTP and JMAP

Generic mail runs on IMAP and SMTP with a password, an app password, or OAuth through SASL `XOAUTH2`
or `OAUTHBEARER` ([RFC 7628](https://www.rfc-editor.org/rfc/rfc7628.html)). IMAP IDLE gives push
without a public endpoint. JSON Meta Application Protocol (JMAP) returns mail as typed JSON, and
pushes changes over an EventSource stream that the client opens, or through Web Push
([RFC 8620](https://www.rfc-editor.org/rfc/rfc8620.txt);
[RFC 8621](https://www.rfc-editor.org/rfc/rfc8621.html)). JMAP Calendars is still a draft in the RFC
Editor queue
([draft-ietf-jmap-calendars](https://datatracker.ietf.org/doc/draft-ietf-jmap-calendars/)).

Fastmail suits a personal deployment: an owner building an app for their own use generates a JMAP
API token with scopes such as read-only or email, while OAuth clients are registered by hand with
Fastmail ([Fastmail developers](https://www.fastmail.com/dev/)). API tokens and app passwords are
unavailable on the Basic plan
([API tokens](https://www.fastmail.help/hc/en-us/articles/5254602856719)). Stalwart, a self-hosted
mail server, implements JMAP for mail, calendars and contacts
([Stalwart](https://www.stalw.art/blog/tags/jmap/)).

## Connectors compared

| Connector                 | Credential                        | Verification for one owner            | Lifetime                            | Push without a public endpoint |
| ------------------------- | --------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------ |
| Gmail API                 | OAuth, restricted scopes          | None under the personal-use exception | Production rules; 7 days in testing | Pub/Sub pull                   |
| Gmail IMAP                | App password                      | None                                  | Until revoked                       | IMAP IDLE                      |
| Google Calendar           | OAuth, sensitive scopes           | None under the personal-use exception | Production rules; 7 days in testing | Not checked                    |
| Google Drive              | OAuth, `drive.file` or restricted | None for `drive.file`                 | Production rules                    | Not checked                    |
| Microsoft Graph           | OAuth, delegated                  | None for the owner's own registration | 90 days, renewed on use             | Delta query polling            |
| Outlook.com IMAP          | OAuth, XOAUTH2                    | Same app registration                 | 90 days, renewed on use             | IMAP IDLE                      |
| iCloud Mail               | App-specific password             | None                                  | Until revoked or password change    | IMAP IDLE                      |
| iCloud Calendar, Contacts | App-specific password             | None                                  | Until revoked or password change    | None                           |
| Fastmail                  | JMAP API token                    | None                                  | Until revoked                       | JMAP EventSource               |

A static credential, such as an app password or a JMAP token, fits imp's broker as it stands,
because the broker injects a static value. Under
[decision 0007](../../decisions/0007-grants-and-taint.md), an imp that reads mail gets no grant, so
the credential stays in nixie's connector on the host either way.

## Search providers

Decision 0005 makes search one of nixie's own tools against a provider the owner picks, and the
provider receives the owner's queries. Google's Custom Search JSON API is closed to new customers
and ends for existing ones on 1 January 2027
([Custom Search](https://developers.google.com/custom-search/v1/overview) [2026-02-18]). Microsoft
retired the Bing Search APIs on 11 August 2025, and its replacement works only inside Foundry
agents, with no raw results
([retirement](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)).
Grounding with Google Search works only through a Gemini model, at $14 per 1,000 prompts after 5,000
free a month for Gemini 3 ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
[2026-10-07]), so it fails the model-agnostic requirement.

| Provider   | Price per 1,000 searches | Free allowance        | Query retention and training                         | Zero retention          | Self-hosted |
| ---------- | ------------------------ | --------------------- | ---------------------------------------------------- | ----------------------- | ----------- |
| Brave      | $5                       | $5 credit a month     | Kept up to 90 days; no training on results           | Enterprise              | No          |
| Exa        | $4 to $15 by mode        | $10 credit a month    | Queries used to train models                         | Enterprise              | No          |
| Kagi       | $12                      | None                  | Not stored against the account; balancer logs 7 days | Not needed              | No          |
| Tavily     | About $8                 | 1,000 credits a month | May use query data to improve responses              | None found              | No          |
| Perplexity | $5, or $1 in fast mode   | Not found             | Zero retention stated for Chat Completions only      | Unclear                 | No          |
| Parallel   | $1 to $5 by mode         | $5 a month            | EU endpoint keeps no content                         | Enterprise              | No          |
| You.com    | $5                       | $100 credit           | No training on prompts                               | Enterprise              | No          |
| Linkup     | $5 to $6                 | 4,000 queries         | Not checked                                          | Enterprise              | No          |
| Serper     | $0.30 to $1              | 2,500 queries         | Policy silent on query logs                          | None found              | No          |
| SerpAPI    | About $5.50 to $25       | 250 a month           | Kept 31 days                                         | ZeroTrace, plan unclear | No          |
| SearXNG    | Free                     | Unlimited             | The owner's own instance                             | Not needed              | Yes         |

Sources: [Brave API](https://brave.com/search/api/),
[Brave privacy policy](https://api-dashboard.search.brave.com/privacy-policy) [2026-08-25],
[Brave zero retention](https://brave.com/blog/search-api-zero-data-retention/) [2026-01-26],
[Exa pricing](https://exa.ai/pricing), [Exa privacy policy](https://exa.ai/privacy-policy)
[2026-06-29], [Kagi API pricing](https://kagi.com/api/pricing),
[Kagi privacy](https://kagi.com/privacy) [2026-09-22],
[Tavily credits](https://docs.tavily.com/documentation/api-credits),
[Tavily privacy](https://www.tavily.com/privacy) [2025-11-24],
[Perplexity pricing](https://docs.perplexity.ai/getting-started/pricing),
[Parallel pricing](https://parallel.ai/pricing), [You.com pricing](https://you.com/pricing),
[Linkup pricing](https://www.linkup.so/pricing), [Serper](https://serper.dev/),
[SerpAPI pricing](https://serpapi.com/pricing), [SerpAPI legal](https://serpapi.com/legal)
[2026-08-27], [SearXNG search API](https://docs.searxng.org/dev/search_api.html).

SearXNG is the only option that keeps queries on the owner's host, but it is a metasearch engine
that aggregates results from up to 261 search services ([SearXNG docs](https://docs.searxng.org/)).
It sends each query on to the services it aggregates, from the host's address, so those services see
the queries without an account attached. Its JSON output is off by default; the owner adds `json` to
`search.formats` in `settings.yml`, or the API returns 403. Kagi's terms come closest among hosted
providers, and Exa's are the furthest, since it trains on query data.

### Result shapes and taint

Every provider returns page text alongside its typed fields, so a search result is clean under
decision 0005 only after the tool drops or isolates that text.

| Provider   | Typed fields                                    | Free text from pages                               |
| ---------- | ----------------------------------------------- | -------------------------------------------------- |
| Brave      | `url`, `age`, `page_age`                        | `title`, `description`, `extra_snippets`           |
| Exa        | `url`, `publishedDate`, `id`, `highlightScores` | `title`, `author`, `text`, `highlights`, `summary` |
| Kagi       | `url`, `time`                                   | `title`, `snippet`, `directAnswer`, `infobox`      |
| Tavily     | `url`, `score`, `published_date`                | `title`, `content`, `raw_content`, `answer`        |
| Perplexity | `url`, `date`, `last_updated`                   | `title`, `snippet`                                 |
| Parallel   | `url`, `publish_date`                           | `title`, `excerpts`                                |
| SearXNG    | `url`, `publishedDate`, `engine`, `score`       | `title`, `content`, `answers`, `infoboxes`         |

A title is short, but a page's author writes it, and it can carry an instruction. Generated answers,
such as Tavily's `answer` and Exa's `summary`, are a model's text over pages, which is free text
too. A search tool that returns URLs, domains, dates and scores leaves the main thread clean, and
the model then knows where results are but not what they say. Reading the titles and snippets needs
either a tainted result or a typed worker, such as one that picks the URLs that answer the owner's
question and returns only those.

## Worth borrowing

- each owner's own OAuth client under Google's personal-use exception, which avoids verification and
  the security assessment
- Gmail through Pub/Sub pull, Graph through delta queries, and mail through IMAP IDLE or JMAP
  EventSource, none of which needs a public endpoint
- Fastmail's JMAP token scopes, such as read-only, as a model of a narrow static credential
- `drive.file`, which limits Drive access to files the owner picks
- a search tool that returns only URLs, domains, dates and scores to a clean main thread

## Worth avoiding

- Google's testing status for a running deployment, which forces a fresh consent every 7 days
- a shared nixie OAuth client, which would need verification and an annual security assessment
- Gmail app passwords as the main path, since Google calls them not recommended and they grant the
  whole mailbox
- Graph webhooks or Gmail Pub/Sub push, which need a public endpoint
- treating a search API's JSON as clean as a whole, since titles, snippets and generated answers are
  page text
- Exa for an owner who cares about query privacy, since it trains on query data

## Recommendations

- **Each owner registers their own OAuth clients, published to production unverified.** Google's
  personal-use exception and Microsoft's delegated scopes give a deployment full access with no
  review. The cost is setup: the owner creates a Google Cloud project and an Azure account, which a
  guided setup in nixie could shorten, and the unverified-app screen appears at each consent.
- **Gmail through the Gmail API, not IMAP.** The API's scopes are narrower and its results are typed
  JSON for headers and labels. IMAP with an app password avoids the Cloud project but grants the
  whole mailbox and depends on a feature Google discourages.
- **iCloud through IMAP, CalDAV and CardDAV with an app-specific password, with Reminders and Notes
  out of scope.** It is the only route. The cost is a credential with no scope, revoked by any
  password change.
- **SearXNG or Kagi as the first search providers, behind one search interface.** SearXNG keeps
  queries on the owner's host but leaks them to upstream engines from the host's address. Kagi keeps
  no query log against the account but costs $12 per 1,000 searches. Brave is the cheaper hosted
  choice at $5 per 1,000 with 90-day retention.
- **A search tool that splits typed fields from page text.** The tool returns URLs, dates and scores
  as a clean result, and titles and snippets as a tainted one or through a typed worker. The cost is
  a model that sees less of each result unless the thread accepts taint.

## Proposed spikes

- **Google personal-use client.** Register an External client in production, unverified, with
  `gmail.modify`, `calendar.events` and `drive.file`. Consent with a consumer account, then refresh
  over 8 days to confirm the token outlives the 7-day testing limit and that Google shows a warning
  rather than a block. About 1 hour of work across 8 days.
- **Graph with a personal account.** Register an app with the `PersonalMicrosoftAccount` audience in
  a free Azure directory, consent to `Mail.ReadWrite` and `Calendars.ReadWrite`, and poll with delta
  queries. It settles whether step-up consent blocks an unverified app for a personal account. About
  half a day.
- **iCloud app-specific password.** Read mail over IMAP, events over CalDAV and contacts over
  CardDAV with one password, to check the forum report that CardDAV refuses fresh passwords. About 2
  hours.
- **Search shapes.** Run 20 owner-style queries through SearXNG, Kagi and Brave, and measure how
  often a URL-only result answers the question without snippets. It shows how much the clean split
  costs. About half a day.

## Open questions

- Does Google block an unverified production app with restricted scopes for its own developer's
  account? Third-party posts report "This app is blocked", and no Google page says so.
- Which Calendar scopes are sensitive and which restricted? Google publishes no per-scope list.
- Does Microsoft's step-up consent apply to a personal account signing in to an unverified app?
- Does Apple open its iCloud sign-in for third-party apps to developers outside its approved set?
- Does Perplexity's zero-retention statement cover its Search API, and is Kagi's v1 Search API open
  to everyone?
- Which of nixie's connectors need push at all, given that a cheap periodic check is a tier 2
  requirement?
