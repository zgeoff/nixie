# Feature switches

- **Status:** agreed
- **Decision records:** [0057](../../decisions/0057-every-optional-feature-has-a-switch.md)
- **Work items:** [feature switches](https://linear.app/zgeoff/issue/GEO-2877)

Each optional feature, such as the computer, calls or Google, is on only when its section is in the
deployment config. A feature that is off does nothing: nixie offers none of its tools, runs none of
its background work, needs none of its images and shows none of its pages. A feature plugs into the
core by filling lists that core modules own, so no core module names it. The builder of the shared
parts reads this whole doc; the builder of one feature's retrofit reads Contracts and Constraints.

## Shape

```mermaid
flowchart LR
  config[deployment config] -->|"section present"| part[feature's parts start]
  config -->|"section absent"| none[parts never start]
  part -->|"fills"| lists[core lists: tools, sources, sweeps, runners, rules, renderers]
  part --> features[nixie.read features]
  features --> client[web client shows its pages]
```

## Contracts

| Feature    | Config key  | Today                                   | With its switch                         |
| ---------- | ----------- | --------------------------------------- | --------------------------------------- |
| `computer` | `computer`  | defaulted, always on                    | on when present                         |
| `code`     | `code`      | no key; the code tool always runs       | on when present; a new key              |
| `voice`    | `voice`     | on when present                         | unchanged                               |
| `devices`  | `devices`   | no key; always on                       | on when present; a new key              |
| `google`   | `google`    | `gmail`, defaulted, always on           | on when present; `gmail` moves under it |
| `mcp`      | `mcp`       | defaulted, always on                    | on when present                         |
| `coding`   | `coding`    | on when `coding.atc` is set             | on when present; `atc` is required      |
| `search`   | `search`    | defaulted; no tool without a credential | on when present; `credential` required  |
| `images`   | `images`    | on when present                         | unchanged                               |
| `mail`     | `mail`      | on when present                         | unchanged                               |
| `spend`    | `spendStop` | on when present                         | unchanged                               |

```yaml
# deployment config. No feature section has a default: absent is off.
computer: {}
code: {}
devices: {}
google:
  gmail: { poll_interval: 2m }
mcp:
  servers: {} # keyed by server ID, as today
```

```ts
// libs/contract. The one list of switchable features; every union and schema derives from it.
export const featureIDs = [
  'computer',
  'code',
  'voice',
  'devices',
  'google',
  'mcp',
  'coding',
  'search',
  'images',
  'mail',
  'spend',
] as const;
export type FeatureID = (typeof featureIDs)[number];

// nixie.read gains the features that are on.
const features = await client.nixie.read();
// → { paused: null, features: ['computer', 'voice', 'google', 'search', 'spend'] }

// Every procedure of a feature that is off answers this typed error.
const featureOff = { FEATURE_OFF: { data: z.object({ feature: z.enum(featureIDs) }) } };
```

```ts
// apps/server. A part declaration names the feature it belongs to, and the features it needs.
{
  name: 'computer',
  feature: 'computer',
  needs: ['inputs', 'context', 'sandbox_adapter'],
  images: () => ['computer'],
  start: (parts) => startComputerPart(/* …existing inputs */),
}
// A part of a feature that is off is left out of the plan. Its images are not needed, and
// parts.find('computer') returns null. A core part reads a feature part only through parts.find.
```

```ts
// Each core module that today names a feature owns a list type instead, and the composition root
// fills it from the parts that are on. Examples of the lists and their owners:
type AlwaysAllowRule = { tool: string; reason: string }; // policy
type InboxRenderer = { kind: string; render: RenderInboxItem }; // sessions
type TaskRunnerEntry = { key: string; runStep: RunStep }; // tasks
type BodyFieldReader = (log: LogReader, request: ActionRequest) => Promise<BodyFields>; // api
type WakeMailSource = { source: string; key: string }; // triggers; replaces { kind: 'gmail' }
```

## Constraints

- These parts are core and have no switch: the sandbox host, the conversation, tasks, memory and the
  notebook, web fetch, policy, the model gateway and the event log.
- When a feature is off:
  - its parts never start, and nixie needs none of its images;
  - the model is offered none of its tools;
  - none of its pollers, sweeps or task runners run, and its readiness keys are absent;
  - its procedures stay registered and answer `FEATURE_OFF`, through one guard in the api module;
  - the web client shows none of its nav entries, routes or banners. A direct visit to one of its
    routes shows a page that says the feature is off in this nixie.
- A feature's tables still exist while it is off, because migrations run for every feature. A
  migration never assumes a provider, such as a column default of `'google'`. Turning a feature off
  keeps its records, and turning it on again finds them as it left them.
- A core part never lists a feature part in `needs`. A feature part may need another feature's part,
  and declares that feature in `requires`; the config load fails when a required feature is off.
- Two checks keep a feature from leaking into the core, and both run in CI on every PR:
  - **Names.** Only these places name a feature or an outside service: the composition root, the
    feature's own packages, `featureIDs` in the contract, and the web client's feature checks. A
    test in `apps/server` fails when any other module or the contract names one. It reads the names
    from `featureIDs` and the adapter folder names, so a new feature or adapter needs no edit to the
    test.
  - **Imports.** `turbo boundaries` splits today's `module` tag into `core` and `feature`. A `core`
    module depends only on `core` modules and libs. A `feature` module may depend on `core` modules,
    libs and the features it `requires`. Adapters and apps keep their rules.
- Each check fails with a message that names the file, the name or import it found, and the fix:
  move the code into the feature's package, or fill a core list from the composition root.
- Keep exceptions rare. Record each as an entry in the ports doc's list of places the code breaks a
  rule, with its reason, and as a per-package override that the check reads. A PR that adds one says
  so in its description. Before the retrofit lands, each existing leak is such an exception, so the
  checks pass from the day they land and each retrofit removes its own entries.
- Tests and test utilities follow the import rule too. A test that needs a core module and a feature
  together lives in `integration/` or in an app's e2e suite.
- Each outside service is an adapter named `<interface>-<system>`. Google's code moves out of the
  connectors module into a `connector-google` adapter behind a `Connector` interface that the
  connections module owns.
- The contract names no provider: a connection's connector is `z.string()`, not
  `z.literal('google')`. That change is breaking, so its PR title carries `!`.
- Until a feature's retrofit lands, `nixie.read` reports it on whenever today's config turns it on.
- The web client reads `nixie.read` after sign-in, and mounts a feature's providers, such as
  `CallProvider`, only when that feature is on.
- Every config in this repo names the features it uses: the Compose recipe, the Kubernetes
  manifests, the Pulumi component's defaults, the preview build, the test build and the e2e
  fixtures. The test build turns every feature on.
- A release that adds a switch to a feature that was always on says so in its notes, and the cloud
  change that deploys it adds the feature's section to that deployment's config.
- In [the ports doc](../../architecture/ports.md), replace the rule that a port exists only when a
  second real provider is in sight with this design's rule, and list each place the code still
  breaks it until the retrofit lands.
- Build the planned designs to follow the rule: the push notice names no `'telegram'` literal
  outside its adapter, the mail and calendar polls take their source from a list that the connector
  fills, and mail and phone keep each provider in its own adapter.

## Builder decides

- How the naming test lists the allowed files, and how a per-package override is written, from what
  `turbo boundaries` offers.
- Which modules take the `feature` tag, from the feature table above.
- The error wording of `FEATURE_OFF` and of a config load that fails for a required feature.
- The names of the core list types and where each is filled.
- The wording of the page that says a feature is off.
- The order of the retrofit, one work item per feature.

## Out of scope

- Switching a core part off.
- Loading a feature's code at runtime.
- A settings page that turns features on and off; the config file is the switch.
