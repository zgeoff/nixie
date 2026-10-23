import { Deployment, StatefulSet } from '@pulumi/kubernetes/apps/v1';
import { CronJob } from '@pulumi/kubernetes/batch/v1';
import { ConfigMap, Secret, Service } from '@pulumi/kubernetes/core/v1';
import type { ComponentResourceOptions, CustomResourceOptions, Input } from '@pulumi/pulumi';
import { ComponentResource, interpolate, rootStackResource, secret } from '@pulumi/pulumi';
import { buildBackupPodSpec } from './build-backup-pod-spec';
import {
  buildNixieSpec,
  definitionsDeployKeyKey,
  definitionsKnownHostsKey,
  nixieAPIPort,
  nixieAgeKeyKey,
  nixieConfigKey,
  nixieLabels,
  nixieSecretsFileKey,
} from './build-nixie-spec';
import { buildNixieWebSpec, nixieWebLabels, nixieWebPort } from './build-nixie-web-spec';
import { buildServiceArgs } from './build-service-args';
import type { NixieArgs, NixieBackupArgs } from './types';

export interface Nixie {
  readonly component: ComponentResource;
  readonly api: Service;
  readonly web: Service;
  readonly statefulSet: StatefulSet;
}

// Pulumi waits for readiness, and nixie turns ready only once impd has pulled its sandbox images
// and booted the conversation imp, which a cold start takes longer than Pulumi's default wait
const rolloutTimeouts = { create: '30m', update: '30m' };

export function createNixie(
  name: string,
  args: NixieArgs,
  opts: ComponentResourceOptions = {},
): Nixie {
  const component = new ComponentResource('heynixie:k8s:Nixie', name, {}, opts);

  // each child keeps the name and the URN it has as a resource of the stack itself, so a stack
  // that declared these resources one by one moves onto the component with no replacement
  const childOptions: CustomResourceOptions = {
    parent: component,
    aliases: [{ parent: rootStackResource }],
  };

  const api = new Service(
    'nixie',
    buildServiceArgs({
      name: 'nixie',
      namespace: args.namespace,
      labels: nixieLabels,
      port: nixieAPIPort,
    }),
    childOptions,
  );

  const statefulSet = new StatefulSet(
    'nixie',
    {
      metadata: { name: 'nixie', namespace: args.namespace },
      spec: buildNixieSpec({
        image: args.image,
        serviceName: api.metadata.name,
        configMap: createConfig(args, childOptions),
        secret: createSecrets(args, childOptions),
        definitionsSecret: createDefinitionsKey(args, childOptions),
        definitionsRepository: args.definitions.repository,
        definitionsRef: args.definitions.ref,
        storageClassName: args.storageClassName,
      }),
    },
    { ...childOptions, customTimeouts: rolloutTimeouts },
  );

  const web = new Service(
    'nixie-web',
    buildServiceArgs({
      name: 'nixie-web',
      namespace: args.namespace,
      labels: nixieWebLabels,
      port: nixieWebPort,
    }),
    childOptions,
  );

  // after nixie, so a first deploy starts the API before the client that calls it
  createWebDeployment(args, api, {
    ...childOptions,
    dependsOn: [statefulSet],
    customTimeouts: rolloutTimeouts,
  });

  if (args.backup !== undefined) {
    createBackupJob(args.namespace, args.backup, statefulSet, childOptions);
  }

  return { component, api, web, statefulSet };
}

// The ConfigMap and the Secrets take no fixed name: Pulumi replaces each on a change, so the
// StatefulSet rolls and nixie reads the change at its next start.
function createConfig(args: NixieArgs, opts: CustomResourceOptions): Input<string> {
  const config = new ConfigMap(
    'nixie-config',
    { metadata: { namespace: args.namespace }, data: { [nixieConfigKey]: args.config } },
    opts,
  );

  return config.metadata.name;
}

function createSecrets(args: NixieArgs, opts: CustomResourceOptions): Input<string> {
  const secrets = new Secret(
    'nixie-secrets',
    {
      metadata: { namespace: args.namespace },
      stringData: {
        // the sops file is encrypted already; the age identity beside it is the secret
        [nixieSecretsFileKey]: args.secretsFile,
        [nixieAgeKeyKey]: secret(args.ageKey),
      },
    },
    opts,
  );

  return secrets.metadata.name;
}

// from https://api.github.com/meta (ssh_keys). git-sync reaches GitHub's SSH on 443, because a host
// may block outbound port 22, and GitHub serves the same key there
const githubKnownHosts =
  '[ssh.github.com]:443 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n';

function createDefinitionsKey(args: NixieArgs, opts: CustomResourceOptions): Input<string> {
  const key = new Secret(
    'nixie-definitions-key',
    {
      metadata: { namespace: args.namespace },
      stringData: {
        // OpenSSH refuses a private key without its final newline
        [definitionsDeployKeyKey]: secret(args.definitions.deployKey).apply(
          (value) => `${value.trimEnd()}\n`,
        ),
        [definitionsKnownHostsKey]: githubKnownHosts,
      },
    },
    opts,
  );

  return key.metadata.name;
}

function createWebDeployment(
  args: NixieArgs,
  api: Service,
  opts: CustomResourceOptions,
): Deployment {
  return new Deployment(
    'nixie-web',
    {
      metadata: { name: 'nixie-web', namespace: args.namespace },
      spec: buildNixieWebSpec({
        image: args.web.image,
        apiURL: interpolate`http://${api.metadata.name}.${args.namespace}.svc.cluster.local:${nixieAPIPort}`,
      }),
    },
    opts,
  );
}

// fixed names, unlike nixie's own ConfigMap and Secrets, because a restore Job's YAML names them
const backupScriptConfigMap = 'nixie-backup-script';
const backupEnvSecret = 'nixie-backup';

function createBackupJob(
  namespace: Input<string>,
  backup: NixieBackupArgs,
  statefulSet: StatefulSet,
  opts: CustomResourceOptions,
): CronJob {
  const env = new Secret(
    'nixie-backup',
    {
      metadata: { name: backupEnvSecret, namespace },
      stringData: backup.environment,
    },
    opts,
  );

  // Pulumi updates the script in place, and the CronJob's next run reads it
  const script = new ConfigMap(
    'nixie-backup-script',
    {
      metadata: { name: backupScriptConfigMap, namespace },
      data: { 'backup.sh': backup.script },
    },
    opts,
  );

  return new CronJob(
    'nixie-backup',
    {
      metadata: { name: 'nixie-backup', namespace },
      spec: {
        schedule: backup.schedule,
        timeZone: backup.timeZone,
        suspend: false,
        concurrencyPolicy: 'Forbid',
        jobTemplate: {
          spec: {
            backoffLimit: 2,
            template: {
              spec: buildBackupPodSpec({
                image: backup.image,

                // the StatefulSet's claim on its one pod; ReadWriteOnce lets the job mount it beside
                // nixie when both run on one node
                claim: 'data-nixie-0',
                scriptConfigMap: backupScriptConfigMap,
                envSecret: backupEnvSecret,
                pullSecret: backup.pullSecret,
              }),
            },
          },
        },
      },
    },
    { ...opts, dependsOn: [env, script, statefulSet] },
  );
}
