# 0057: Every optional feature has a switch

- Date: 2026-11-26
- Status: decided

## Decision

nixie's core never names an outside service or an optional feature. Each outside service plugs in as
an adapter behind an interface that a nixie module owns. Each optional feature, outside service or
not, is on only when its section is in the deployment config. A feature that is off leaves no trace:
no tools, no pollers or sweeps, no required images, no readiness keys and no pages in the web
client.

The parts nixie can't run without stay core and have no switch: the sandbox host, the conversation,
tasks, memory, web fetch, policy and the event log.

## Why

- A person who runs nixie may lack the infrastructure or the account a feature needs, such as a
  desktop sandbox or a Google account, and must still get a working nixie.
- With no Google connection, the model is still offered every Gmail tool and the Gmail poller still
  runs, because Google's code sits inside a core module and other modules name it.
- Coding sessions, web search, images and the assistant's mailbox already turn off when their config
  section is left out, and cost little because each was built that way from the start.

## Rejected alternatives

| Option                                                         | Why not                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A port only when a second real provider is in sight            | It let a single provider, Google, live inside a core module, and nothing turned it off.                 |
| A flag per feature, each added its own way                     | Each feature would leave a different trace when off, and the web client would need a check per feature. |
| Packages loaded at runtime from a plugin folder                | A release is one tested build; code that loads at runtime escapes its tests and its import rules.       |
| Optional features stay core, and only outside services plug in | A deployment with no desktop sandbox still can't start, because the computer needs its image.           |

## Consequences

- Retrofitting the tangled features costs about 30 to 40 files each for Google, calls and devices.
- A deployment's config must name each feature it uses, so a release that adds a switch to a feature
  that was always on adds that section to every deployment it ships to.
