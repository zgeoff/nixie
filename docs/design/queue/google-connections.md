# Google connections

- **Status:** agreed
- **Work items:** [Gmail](https://linear.app/zgeoff/issue/GEO-1825),
  [Calendar](https://linear.app/zgeoff/issue/GEO-1826),
  [Drive](https://linear.app/zgeoff/issue/GEO-1827)
- **Decision records:** [0010](../../decisions/0010-oauth-clients.md),
  [0007](../../decisions/0007-crypto-shredding.md)

You connect a Google account from the web client, and every Google tool reads Google live through
that connection. nixie keeps no copy of your mail, events or files, and the text a tool returned
lives only in that call's record. The connection itself is built. Read
[Google connections](../../architecture/connectors/google-connections.md) for the client, the
consent, the fewer-scopes check and the fetcher, and follow
[the setup guide](../../guides/google.md) for the steps you take. Below is what the Google tools
need from the connection. The Gmail, Calendar and Drive tools are all built on these contracts, and
a new Google tool follows them too.

| Part                                                                              | What it holds                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| this page                                                                         | what a tool gets from a connection, the scope each tool needs, runs in flight        |
| [the credential database](../../architecture/connectors/credential-database.md)   | the tables, the records, refresh, Forget and resets                                  |
| [the Google tools](gmail-calendar-drive-tools.md)                                 | the rules every Google tool keeps, and the `gmail.*` tools                           |
| [Calendar and Drive tools](../../architecture/connectors/calendar-drive-tools.md) | the `calendar.*` and `drive.*` tools, their checks and the Drive picker              |
| [Gmail arrivals](https://github.com/zgeoff/nixie/pull/1420)                       | the Gmail source that wakes a task, and the `gmail.wake_*` tools, in the mail design |
| [the calendar poll](mail-and-calendar-polls.md)                                   | calendar changes that wake a task                                                    |

The connection argument shipped with the Gmail tools, in the
[Gmail](https://linear.app/zgeoff/issue/GEO-1825) work item. Job pins and the model's status line
are not built yet, so the two pin rules under Tasks in flight apply once pins land. Read
[the connection argument](../platform/connectors/connector.md#the-connection-argument) for the pin
rules. With no pin on a job run, a tool resolves each call against every live Google connection.

## Contracts

### The connector

```ts
// connectors module. The Google connector holds the actions of every Google tool. Add a new
// tool's actions here.
const googleConnector: Connector = {
  id: 'google',
  auth: googleOAuth, // built
  setup: googleSetup, // built
  actions, // the Gmail, Calendar and Drive tools
  check: checkGoogleScopes, // built: one read per scope, reports `missing`
};

// connections module: what a Google tool, attempt or check gets for one connection. The tool
// endpoint maps a short ID to the connection ID before it calls.
connections.readContext('6f1c2a9e-…'); // the connection ID, a UUID, as the Gmail source passes it
// → { connectionID: '6f1c2a9e-…', connection: 'k3x9m2p7qa', account: 'you@example.com', fetch }
//   or null when the connection is not live
interface ConnectorContext {
  connectionID: string;
  connection: string; // the short ID
  account: string; // the ID token's email, decrypted at each call
  fetch: typeof fetch; // the credential store's fetcher for this connection, limited to the connector's origins
}
```

The default label of a Google connection is the ID token's `email`.

## Constraints

### Scopes and tools

| Scope                            | The tools it holds                                                             |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `gmail.modify`                   | every `gmail.*` tool                                                           |
| `calendar.events`                | every `calendar.*` tool except `calendar.list_calendars`                       |
| `calendar.calendarlist.readonly` | `calendar.list_calendars` (`calendar.events` does not cover the calendar list) |
| `drive.file`                     | every `drive.*` tool, and the Drive picker                                     |

- The tool endpoint of each task run and worker run leaves out each tool whose scope is in
  `missing`.
- A connection with only the identity scopes still connects, so you can add scopes later, and lists
  no tools.
- Each action lists its scopes in `ConnectorAction.scopes`, and the filter holds back an action
  whose scope is missing.

### Tasks in flight

- The conversation's endpoint builds its tool list at each turn from the live connections, so a new
  connection, a Forget or a change in `missing` reaches the conversation at its next turn. A worker
  run keeps its list for its life. Once pins are built, a job run keeps its pins, as
  [the connection argument](../platform/connectors/connector.md#the-connection-argument) sets.
- Every call checks the connection at the time of the call. A call to a forgotten connection fails
  with the error for a `forgotten` credential, which never holds the connection's label or status,
  because Forget erases them.
- Once pins are built, a job whose pins all name forgotten connections lists none of the connector's
  tools.
- Forget erases a connection's Gmail wake rules and held arrivals as children of the connection,
  through the `readChildren` of its erasable, which returns none until the
  [mail design](https://github.com/zgeoff/nixie/pull/1420) is built.

## Out of scope

- A second OAuth client per connector, and connectors from other providers.
