import { expect, mock, onTestFinished, test } from 'bun:test';
import type { ResourceTransformation } from '@pulumi/pulumi';
import { rootStackResource, runtime } from '@pulumi/pulumi';
import { createNixie } from './create-nixie';
import { buildStubResourceMocks } from './test-utils/build-stub-resource-mocks';

async function setupTest() {
  const stub = buildStubResourceMocks();

  await runtime.setMocks(stub.mocks, 'assistant', 'test');

  onTestFinished(() => {
    runtime.resetOptions('', '', -1, '', '', false, '');
  });

  return { stub };
}

test("it registers nixie's StatefulSet on the Service, the ConfigMap and the Secrets it creates", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const lockedDown = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  };

  const statefulSet = await ctx.stub.whenRegistered('kubernetes:apps/v1:StatefulSet::nixie');

  expect(statefulSet).toStrictEqual({
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'nixie', namespace: 'assistant' },
    spec: {
      replicas: 1,
      updateStrategy: { type: 'RollingUpdate' },
      podManagementPolicy: 'Parallel',
      serviceName: 'nixie',
      selector: { matchLabels: { app: 'nixie' } },
      template: {
        metadata: { labels: { app: 'nixie' } },
        spec: {
          terminationGracePeriodSeconds: 60,
          securityContext: {
            fsGroup: 10_001,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          volumes: [
            { name: 'config', configMap: { name: 'nixie-config-0a1b2c3d' } },
            {
              name: 'secrets',
              secret: { secretName: 'nixie-secrets-0a1b2c3d', defaultMode: 0o440 },
            },
            {
              name: 'definitions-key',
              secret: { secretName: 'nixie-definitions-key-0a1b2c3d', defaultMode: 0o440 },
            },
            { name: 'definitions', emptyDir: {} },
            { name: 'tmp', emptyDir: {} },
            { name: 'git-sync-tmp', emptyDir: {} },
          ],
          containers: [
            {
              name: 'nixie',
              image:
                'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
              ports: [{ name: 'http', containerPort: 8080 }],
              env: [{ name: 'SOPS_AGE_KEY_FILE', value: '/etc/nixie/age/age-key.txt' }],
              startupProbe: {
                httpGet: { path: '/health/live', port: 8080 },
                periodSeconds: 5,
                failureThreshold: 60,
              },
              livenessProbe: {
                httpGet: { path: '/health/live', port: 8080 },
                periodSeconds: 30,
                failureThreshold: 3,
              },
              readinessProbe: {
                httpGet: { path: '/health/ready', port: 8080 },
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
              },
              volumeMounts: [
                { name: 'data', mountPath: '/data' },
                {
                  name: 'config',
                  mountPath: '/etc/nixie/config.yaml',
                  subPath: 'config.yaml',
                  readOnly: true,
                },
                {
                  name: 'secrets',
                  mountPath: '/etc/nixie/secrets.yaml',
                  subPath: 'secrets.yaml',
                  readOnly: true,
                },
                {
                  name: 'secrets',
                  mountPath: '/etc/nixie/age/age-key.txt',
                  subPath: 'age-key.txt',
                  readOnly: true,
                },
                { name: 'definitions', mountPath: '/etc/nixie/definitions', readOnly: true },
                { name: 'tmp', mountPath: '/tmp' },
              ],
              securityContext: { ...lockedDown, runAsUser: 10_001, runAsGroup: 10_001 },
              resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { memory: '1Gi' } },
            },
            {
              name: 'git-sync',
              image:
                'registry.k8s.io/git-sync/git-sync:v4.7.1@sha256:c5e1976da735bf0b53979f079a07475d77174c51863cd084e928ff6074480717',
              env: [
                {
                  name: 'GITSYNC_REPO',
                  value: 'ssh://git@ssh.github.com:443/example/assistant-definitions.git',
                },
                { name: 'GITSYNC_REF', value: 'live' },
                { name: 'GITSYNC_ROOT', value: '/etc/nixie/definitions' },
                { name: 'GITSYNC_LINK', value: 'current' },
                { name: 'GITSYNC_PERIOD', value: '60s' },
                { name: 'GITSYNC_DEPTH', value: '1' },
                { name: 'GITSYNC_SSH_KEY_FILE', value: '/etc/git-secret/ssh' },
                { name: 'GITSYNC_SSH_KNOWN_HOSTS', value: 'true' },
                { name: 'GITSYNC_SSH_KNOWN_HOSTS_FILE', value: '/etc/git-secret/known_hosts' },
              ],
              volumeMounts: [
                { name: 'definitions', mountPath: '/etc/nixie/definitions' },
                { name: 'definitions-key', mountPath: '/etc/git-secret', readOnly: true },
                { name: 'git-sync-tmp', mountPath: '/tmp' },
              ],
              securityContext: { ...lockedDown, runAsUser: 65_533, runAsGroup: 65_533 },
              resources: { requests: { cpu: '10m', memory: '32Mi' }, limits: { memory: '128Mi' } },
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: 'data' },
          spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: 'local-retain',
            resources: { requests: { storage: '10Gi' } },
          },
        },
      ],
    },
  });
});

test("it registers the Service that selects nixie's pod", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const service = await ctx.stub.whenRegistered('kubernetes:core/v1:Service::nixie');

  expect(service).toStrictEqual({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'nixie',
      namespace: 'assistant',
      annotations: { 'pulumi.com/skipAwait': 'true' },
    },
    spec: {
      selector: { app: 'nixie' },
      ports: [{ name: 'http', port: 8080, targetPort: 'http' }],
    },
  });
});

test('it registers the config as a ConfigMap that Pulumi names', async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const config = await ctx.stub.whenRegistered('kubernetes:core/v1:ConfigMap::nixie-config');

  expect(config).toStrictEqual({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { namespace: 'assistant' },
    data: { 'config.yaml': 'models: {}\n' },
  });
});

test('it registers the secrets file and the age key as a secret', async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const secrets = await ctx.stub.whenRegistered('kubernetes:core/v1:Secret::nixie-secrets');

  expect(secrets).toStrictEqual({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { namespace: 'assistant' },
    stringData: {
      [runtime.specialSigKey]: runtime.specialSecretSig,
      value: { 'secrets.yaml': 'sops: {}\n', 'age-key.txt': 'AGE-SECRET-KEY-1EXAMPLE' },
    },
  });
});

test("it registers the definitions deploy key as a secret that ends in one newline, beside GitHub's host key", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests\n\n',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const key = await ctx.stub.whenRegistered('kubernetes:core/v1:Secret::nixie-definitions-key');

  expect(key).toStrictEqual({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { namespace: 'assistant' },
    stringData: {
      [runtime.specialSigKey]: runtime.specialSecretSig,
      value: {
        ssh: 'an ssh key for tests\n',
        known_hosts:
          '[ssh.github.com]:443 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n',
      },
    },
  });
});

test('it parents each resource to the component, with an alias to the stack', async () => {
  const ctx = await setupTest();

  const transformation = mock<ResourceTransformation>();

  const nixie = createNixie(
    'nixie',
    {
      namespace: 'assistant',
      image:
        'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
      config: 'models: {}\n',
      secretsFile: 'sops: {}\n',
      ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
      definitions: {
        repository: 'example/assistant-definitions',
        ref: 'live',
        deployKey: 'an ssh key for tests',
      },
      storageClassName: 'local-retain',
      web: {
        image:
          'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
      backup: {
        image:
          'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
        pullSecret: 'registry-pull',
        script: '#!/bin/sh\necho backup\n',
        schedule: '30 2 * * *',
        timeZone: 'Europe/Oslo',
        environment: { RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant' },
      },
    },
    { transformations: [transformation] },
  );

  await ctx.stub.whenRegistered('kubernetes:batch/v1:CronJob::nixie-backup');

  expect(
    transformation.mock.calls.map(([args]) => ({
      resource: `${args.type}::${args.name}`,
      parent: args.opts.parent,
      aliases: args.opts.aliases,
    })),
  ).toStrictEqual([
    { resource: 'heynixie:k8s:Nixie::nixie', parent: undefined, aliases: undefined },
    {
      resource: 'kubernetes:core/v1:Service::nixie',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:ConfigMap::nixie-config',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:Secret::nixie-secrets',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:Secret::nixie-definitions-key',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:apps/v1:StatefulSet::nixie',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:Service::nixie-web',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:apps/v1:Deployment::nixie-web',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:Secret::nixie-backup',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:core/v1:ConfigMap::nixie-backup-script',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
    {
      resource: 'kubernetes:batch/v1:CronJob::nixie-backup',
      parent: nixie.component,
      aliases: expect.arrayContaining([{ parent: rootStackResource }]),
    },
  ]);
});

test("it rolls the web client and the backup out after nixie's StatefulSet, and waits longer for both rollouts", async () => {
  const ctx = await setupTest();

  const transformation = mock<ResourceTransformation>();

  const nixie = createNixie(
    'nixie',
    {
      namespace: 'assistant',
      image:
        'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
      config: 'models: {}\n',
      secretsFile: 'sops: {}\n',
      ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
      definitions: {
        repository: 'example/assistant-definitions',
        ref: 'live',
        deployKey: 'an ssh key for tests',
      },
      storageClassName: 'local-retain',
      web: {
        image:
          'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
      backup: {
        image:
          'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
        pullSecret: 'registry-pull',
        script: '#!/bin/sh\necho backup\n',
        schedule: '30 2 * * *',
        timeZone: 'Europe/Oslo',
        environment: { RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant' },
      },
    },
    { transformations: [transformation] },
  );

  await ctx.stub.whenRegistered('kubernetes:batch/v1:CronJob::nixie-backup');

  expect(
    transformation.mock.calls
      .filter(
        ([args]) =>
          args.type.startsWith('kubernetes:apps/') || args.type.startsWith('kubernetes:batch/'),
      )
      .map(([args]) => ({
        resource: `${args.type}::${args.name}`,
        dependsOn: args.opts.dependsOn,
        customTimeouts: args.opts.customTimeouts,
      })),
  ).toStrictEqual([
    {
      resource: 'kubernetes:apps/v1:StatefulSet::nixie',
      dependsOn: undefined,
      customTimeouts: { create: '30m', update: '30m' },
    },
    {
      resource: 'kubernetes:apps/v1:Deployment::nixie-web',
      dependsOn: [nixie.statefulSet],
      customTimeouts: { create: '30m', update: '30m' },
    },
    {
      resource: 'kubernetes:batch/v1:CronJob::nixie-backup',
      dependsOn: [expect.anything(), expect.anything(), nixie.statefulSet],
      customTimeouts: undefined,
    },
  ]);
});

test("it registers the web client's Deployment, which calls nixie's API by its Service", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const deployment = await ctx.stub.whenRegistered('kubernetes:apps/v1:Deployment::nixie-web');

  expect(deployment).toStrictEqual({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'nixie-web', namespace: 'assistant' },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'nixie-web' } },
      template: {
        metadata: { labels: { app: 'nixie-web' } },
        spec: {
          securityContext: { runAsNonRoot: true, seccompProfile: { type: 'RuntimeDefault' } },
          volumes: [{ name: 'tmp', emptyDir: {} }],
          containers: [
            {
              name: 'web',
              image:
                'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
              ports: [{ name: 'http', containerPort: 3000 }],
              env: [
                { name: 'NIXIE_API_URL', value: 'http://nixie.assistant.svc.cluster.local:8080' },
                { name: 'PORT', value: '3000' },
              ],
              livenessProbe: {
                httpGet: { path: '/health/live', port: 3000 },
                periodSeconds: 30,
                failureThreshold: 3,
              },
              readinessProbe: { httpGet: { path: '/health/ready', port: 3000 }, periodSeconds: 10 },
              volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ['ALL'] },
                runAsUser: 1000,
                runAsGroup: 1000,
              },
              resources: { requests: { cpu: '20m', memory: '96Mi' }, limits: { memory: '512Mi' } },
            },
          ],
        },
      },
    },
  });
});

test("it registers the Service that selects the web client's pod", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  });

  const service = await ctx.stub.whenRegistered('kubernetes:core/v1:Service::nixie-web');

  expect(service).toStrictEqual({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'nixie-web',
      namespace: 'assistant',
      annotations: { 'pulumi.com/skipAwait': 'true' },
    },
    spec: {
      selector: { app: 'nixie-web' },
      ports: [{ name: 'http', port: 3000, targetPort: 'http' }],
    },
  });
});

test("it registers the backup CronJob on nixie's data volume, with the deployment's schedule and image", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
    backup: {
      image:
        'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
      pullSecret: 'registry-pull',
      script: '#!/bin/sh\necho backup\n',
      schedule: '30 2 * * *',
      timeZone: 'Europe/Oslo',
      environment: { RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant' },
    },
  });

  const cronJob = await ctx.stub.whenRegistered('kubernetes:batch/v1:CronJob::nixie-backup');

  expect(cronJob).toStrictEqual({
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: { name: 'nixie-backup', namespace: 'assistant' },
    spec: {
      schedule: '30 2 * * *',
      timeZone: 'Europe/Oslo',
      suspend: false,
      concurrencyPolicy: 'Forbid',
      jobTemplate: {
        spec: {
          backoffLimit: 2,
          template: {
            spec: {
              restartPolicy: 'OnFailure',
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 10_001,
                runAsGroup: 10_001,
                fsGroup: 10_001,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              automountServiceAccountToken: false,
              imagePullSecrets: [{ name: 'registry-pull' }],
              containers: [
                {
                  name: 'backup',
                  image:
                    'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
                  command: ['/bin/sh', '/opt/nixie-backup/backup.sh'],
                  args: ['backup'],
                  env: [
                    { name: 'STATE_DIR', value: '/state' },
                    { name: 'HOME', value: '/tmp' },
                  ],
                  envFrom: [{ secretRef: { name: 'nixie-backup' } }],
                  volumeMounts: [
                    { name: 'state', mountPath: '/state' },
                    { name: 'script', mountPath: '/opt/nixie-backup', readOnly: true },
                    { name: 'tmp', mountPath: '/tmp' },
                  ],
                  resources: {
                    requests: { cpu: '50m', memory: '64Mi' },
                    limits: { memory: '256Mi' },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ['ALL'] },
                  },
                },
              ],
              volumes: [
                { name: 'state', persistentVolumeClaim: { claimName: 'data-nixie-0' } },
                { name: 'script', configMap: { name: 'nixie-backup-script' } },
                { name: 'tmp', emptyDir: {} },
              ],
            },
          },
        },
      },
    },
  });
});

test("it registers the backup's environment as a secret in a Secret that the restore Job names", async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
    backup: {
      image:
        'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
      pullSecret: 'registry-pull',
      script: '#!/bin/sh\necho backup\n',
      schedule: '30 2 * * *',
      timeZone: 'Europe/Oslo',
      environment: {
        RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant',
        RESTIC_PASSWORD: 'a restic password for tests',
      },
    },
  });

  const env = await ctx.stub.whenRegistered('kubernetes:core/v1:Secret::nixie-backup');

  expect(env).toStrictEqual({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'nixie-backup', namespace: 'assistant' },
    stringData: {
      [runtime.specialSigKey]: runtime.specialSecretSig,
      value: {
        RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant',
        RESTIC_PASSWORD: 'a restic password for tests',
      },
    },
  });
});

test('it registers the backup script as a ConfigMap that the restore Job names', async () => {
  const ctx = await setupTest();

  createNixie('nixie', {
    namespace: 'assistant',
    image:
      'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
    config: 'models: {}\n',
    secretsFile: 'sops: {}\n',
    ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
    definitions: {
      repository: 'example/assistant-definitions',
      ref: 'live',
      deployKey: 'an ssh key for tests',
    },
    storageClassName: 'local-retain',
    web: {
      image:
        'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
    backup: {
      image:
        'ghcr.io/example/backup:1.0.0@sha256:3333333333333333333333333333333333333333333333333333333333333333',
      pullSecret: 'registry-pull',
      script: '#!/bin/sh\necho backup\n',
      schedule: '30 2 * * *',
      timeZone: 'Europe/Oslo',
      environment: { RESTIC_REPOSITORY: 's3:https://backups.example.test/assistant' },
    },
  });

  const script = await ctx.stub.whenRegistered('kubernetes:core/v1:ConfigMap::nixie-backup-script');

  expect(script).toStrictEqual({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'nixie-backup-script', namespace: 'assistant' },
    data: { 'backup.sh': '#!/bin/sh\necho backup\n' },
  });
});

test('it registers no backup resource when the deployment sets no backup', async () => {
  const ctx = await setupTest();

  const transformation = mock<ResourceTransformation>();

  createNixie(
    'nixie',
    {
      namespace: 'assistant',
      image:
        'ghcr.io/example/nixie:1.2.3@sha256:1111111111111111111111111111111111111111111111111111111111111111',
      config: 'models: {}\n',
      secretsFile: 'sops: {}\n',
      ageKey: 'AGE-SECRET-KEY-1EXAMPLE',
      definitions: {
        repository: 'example/assistant-definitions',
        ref: 'live',
        deployKey: 'an ssh key for tests',
      },
      storageClassName: 'local-retain',
      web: {
        image:
          'ghcr.io/example/nixie-web:1.2.3@sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
    },
    { transformations: [transformation] },
  );

  await ctx.stub.whenRegistered('kubernetes:apps/v1:Deployment::nixie-web');

  expect(transformation.mock.calls.map(([args]) => `${args.type}::${args.name}`)).toStrictEqual([
    'heynixie:k8s:Nixie::nixie',
    'kubernetes:core/v1:Service::nixie',
    'kubernetes:core/v1:ConfigMap::nixie-config',
    'kubernetes:core/v1:Secret::nixie-secrets',
    'kubernetes:core/v1:Secret::nixie-definitions-key',
    'kubernetes:apps/v1:StatefulSet::nixie',
    'kubernetes:core/v1:Service::nixie-web',
    'kubernetes:apps/v1:Deployment::nixie-web',
  ]);
});
