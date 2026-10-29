<div align="center">
  <h1>@heynixie/contract</h1>

  <p>
    <a href="https://www.npmjs.com/package/@heynixie/contract"><img src="https://img.shields.io/npm/v/@heynixie/contract" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/channels/api.md">API</a> •
    <a href="../../docs/architecture/deployment/release-pipeline.md">Release pipeline</a>
  </p>
</div>

The oRPC contract of the nixie API, with the types a client needs.

Each release of nixie publishes the contract at its own version, so a client takes a change to the
API with a version bump. To start, install the package beside `@orpc/client`, build a client of the
`ContractClient` type on an oRPC link to your nixie's `/rpc` path, and send the client header on
every call.

## Install

The package ships an ES module with its type declarations, so a client on Node, on Bun or in a
browser bundle loads it. It depends on oRPC and Zod at the versions nixie pins.

```bash
bun add @heynixie/contract @orpc/client
```

## Features

- **The contract.** `contract` holds every procedure the API serves, with the Zod schema of each
  input and output, and `hostContract` holds the procedures that the host commands call on the
  server's local socket.
- **The client types.** `ContractClient`, `ContractInputs` and `ContractOutputs` give each
  procedure's call, input and output.
- **The call headers.** `clientHeaderName` holds the name of the header the API needs on every call,
  and `sessionCookieName` holds the name of the cookie that carries a device session.

## Configuration

A client points its oRPC link at the API's `/rpc` path, and
[the API](../../docs/architecture/channels/api.md) describes how a call carries its device session.
