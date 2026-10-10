# 0034: The code layout

- Date: 2026-10-10
- Status: decided
- Design: [code layout](../design/platform/code-layout.md)

nixie's code is one Bun workspace in 5 folders: `apps/` for deployables, `modules/` for domain
modules, `guests/` for programs that run inside a sandbox, `adapters/` for implementations of
nixie's own interfaces that reach an outside system, and `libs/` for shared code. Every package
takes the `@heynixie/` npm scope, and the repo and the product keep the name nixie.

A package exposes only its entry point through its `exports` map, and `turbo boundaries` checks each
dependency against a rule per tag: libs depend only on libs, guests and clients never reach a module
or a server-only lib, and modules never depend on apps, guests or adapters.

## Why

- Guest code runs in a different trust zone from the server and ships in its own images, so its own
  folder and tag let a check stop it from importing the trusted core.
- Adapters in their own folder keep each outside system's client in one package, and leave them
  ready to publish on their own.
- `exports` and tag rules enforce the boundaries with no lint plugin to maintain, and the same check
  refuses an undeclared workspace import, a relative path into another package and a cycle.
- The `nixie` npm scope belongs to someone else, and `@heynixie/` is free to publish under.

## Alternatives

- **One flat `packages/*` folder.** It is the shortest layout, and the trust zones show only in
  package names, which no check reads.
- **Lint rules for the boundaries.** A lint rule can block a deep import, and it needs its own
  configuration for the direction rules that tags express in one table.
- **The `@nixie/` scope.** Another npm account holds it.

## Consequences

- `apps/server` constructs every adapter and passes it to the module that owns its interface.
- An adapter's dependency on only the module that owns its interface is a review rule, because tags
  allow any module.
- Each slice creates the packages it first builds.
