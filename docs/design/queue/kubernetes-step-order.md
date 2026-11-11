# The step order of the Kubernetes component

The Kubernetes component is the Pulumi package `@heynixie/pulumi-k8s`, which declares nixie's pod,
web client and backup. A deployment's Pulumi program calls it, and gets each change to how nixie
runs on Kubernetes when it bumps the package's version. This doc covers one contract of the
component: the deployment's program can put a resource of its own, called the caller's step here,
ahead of the 4 resources that the pod mounts. The usual caller's step adds the sandbox images of the
release to the sandbox runtime. With that order, the pod never starts on a config whose sandbox
images the sandbox runtime lacks.

The sketches in `sketches/sandboxes/` hold the code shapes of the sandboxes family, which this doc
is part of, and this doc holds the rules. Terms are in the [glossary](../../glossary.md). Each
`(open: <name>)` mark has an item in [the open list](open/sandboxes.md), which links the tracker
issue.

## Built

This section is what the code does. The section after it is the design.

- `createNixie(name, args, opts)` builds a `heynixie:k8s:Nixie` component resource. `NixieArgs`
  holds its arguments.
- The 4 resources that the pod mounts are the pod's ConfigMap, its 2 Secrets and its StatefulSet.
- Each release publishes the package as `@heynixie/pulumi-k8s`.
- `createNixie` sets the options of each child resource itself. The web client's Deployment depends
  on the StatefulSet. The backup's CronJob depends on the backup's own resources and on the
  StatefulSet.
- Each child has a fixed Pulumi name, and an alias whose parent is the stack. A program that
  declared the same resources at the top of its stack therefore moves onto the component, and Pulumi
  replaces no resource.
- The deployment's program declares the namespace, the network policies, the pull secret and the
  ingress.
- The deployment's backup job uses the release's backup image.
- nixie refuses to start on a config that a release after its own wrote.

## The contract

A usage example: [a program puts its step first](sketches/sandboxes/01-usage.ts), section H of that
file.

- The program passes the caller's step as `dependsOn` in the `opts` of `createNixie`
  `(open: dependsOn check)`. The open item is a test that shows whether Pulumi hands the component's
  `dependsOn` to each child.
- When the caller's step fails, Pulumi applies nothing to the 4 resources. The running pod then runs
  on the config it has.
- A program with no step of its own passes no `dependsOn`.
- The component's README holds one sentence for the caller: `dependsOn` in `opts` puts a resource
  ahead of the 4 resources.
- When the test shows a child that does not depend on the caller's step, `dependsOn` is not the
  contract's form. The component then takes the step in an optional argument, which has no design
  `(open: ordering argument)`. A program that omits that argument gets the resources it gets without
  it.
- A program that put its own step ahead of its own copies of the 4 resources moves onto the
  component with the same order. Its Pulumi preview shows no replaced resource, and the
  StatefulSet's volume is the same volume after the move.
- A deployment pins the component's version in its own program.

## Not in scope

- A Helm chart, and a deploy outside Kubernetes.
- What the caller's step does. The deployment's program holds the step that adds the images, and
  also the ingress, the certificate and the restore.
- The move of a deployment's program onto the component. That work is in the deployment's own repo.
- An interface for the component inside nixie. The component is one of 3 ways to deploy nixie,
  beside the Compose recipe and the reference manifests, and nixie's code calls none of them.
