<div align="center">
  <h1>@heynixie/pulumi-k8s</h1>

  <p>
    <a href="https://www.npmjs.com/package/@heynixie/pulumi-k8s"><img src="https://img.shields.io/npm/v/@heynixie/pulumi-k8s" alt="npm version"></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/deployment/kubernetes.md#the-pulumi-component">Kubernetes</a> •
    <a href="../../docs/architecture/deployment/release-pipeline.md">Release pipeline</a>
  </p>
</div>

A Pulumi component that runs nixie on Kubernetes.

The component registers nixie's StatefulSet, the web client and the backup job in one namespace, in
the shape each nixie release ships. Each release of nixie publishes the component at its own
version, so a deployment takes a change to that shape with a version bump. To start, install the
package beside your Pulumi SDKs, call `createNixie` with your namespace and images, and point your
ingress at the two Services it returns.

## Install

The package ships TypeScript source, so your Pulumi program runs on Bun or another runtime that
loads TypeScript, and declares `@pulumi/pulumi` 3 and `@pulumi/kubernetes` 4 itself.

```bash
bun add @heynixie/pulumi-k8s
```

## Features

- **nixie's pod.** One replica on a `ReadWriteOnce` claim, with the configuration, the encrypted
  secrets and a git-sync container that follows your definitions repo on GitHub.
- **The web client.** A Deployment that rolls out after nixie and calls its API by the Service.
- **The backup.** A CronJob that runs your backup script on nixie's volume, on your schedule.
- **Moving onto it.** Each resource keeps its own Pulumi name and an alias to the stack, so a stack
  that declared the same resources itself moves onto the component with no replacement.

## Configuration

`createNixie(name, args, opts)` takes the per-deployment values in `args`, and their types in
[`src/types.ts`](src/types.ts) describe each one. Pass your Kubernetes provider in `opts`.

```ts
import { createNixie, nixieAPIPort, nixieWebPort } from '@heynixie/pulumi-k8s';

const nixie = createNixie(
  'nixie',
  {
    namespace: 'assistant',
    image: 'ghcr.io/zgeoff/nixie:<version>@sha256:<digest>',
    web: { image: 'ghcr.io/zgeoff/nixie-web:<version>@sha256:<digest>' },
    config: configText,
    secretsFile: sopsFileText,
    ageKey: ageKeySecret,
    definitions: { repository: '<owner>/<repo>', ref: 'live', deployKey: deployKeySecret },
    storageClassName: 'local-path',
  },
  { provider: cluster },
);
```

## Documentation

The [Kubernetes architecture](../../docs/architecture/deployment/kubernetes.md) covers the shape.
