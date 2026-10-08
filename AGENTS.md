# nixie

A personal assistant platform. The project is in the design phase and has no product code.

`spikes/` holds throwaway experiments that answer research questions. Each spike is its own Bun
package, and its README gives the question, how to run it, and what it found. Product code never
imports from a spike.

## Docs layout

[docs/README.md](docs/README.md) is the index. The root of `docs/` holds the overview, the
principles and the scope. `docs/decisions/` holds numbered decision records: the numbers are stable
IDs, the records stay flat, and the index groups them by topic. `docs/research/` and
`docs/brainstorm/` are kept for their evidence until they are archived, and a decision supersedes
any research recommendation it covers.

`docs/design/` holds designs for what is not built yet, and `docs/architecture/` holds what is
built. Both use the topics the index uses for decisions: core, policy, memory, channels, connectors
and deployment. `docs/design/open-items.md` lists everything still open.

The structure grows by these rules:

1. A topic folder is created when its first doc exists, and starts as flat files.
2. A topic gets a README index once it holds more than 3 docs.
3. A component gets its own subfolder once it has more than one doc.
4. A topic splits when its docs stop referring to each other.
5. A new or split topic updates the topic list in the docs index, and the decision groups follow it.

## Choices that need the owner

The owner decides architecture, framework, library and technology choices, along with naming and
anything about how nixie feels to use. A design doc lists the options with a recommendation and
leaves the choice open. A decision record exists only for what the owner agreed.
