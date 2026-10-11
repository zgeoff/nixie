import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deploymentConfigSchema } from '../../apps/server/src/index';

// The reference manifests are YAML with no build step, so these tests read them as data: each
// resource by its kind and name, from every file that kustomization.yaml lists.
async function setupTest() {
  const dir = import.meta.dir;
  const kustomizationText = await Bun.file(join(dir, 'kustomization.yaml')).text();

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kubeconform checks the shape
  const kustomization = Bun.YAML.parse(kustomizationText) as { readonly resources: string[] };
  const files = kustomization.resources;
  const texts = await Promise.all(files.map((file) => Bun.file(join(dir, file)).text()));

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kubeconform checks the shape
  const resources = texts.flatMap((text) => [Bun.YAML.parse(text)].flat()) as Resource[];
  const find = (kind: string, name: string) =>
    resources.find((resource) => resource.kind === kind && resource.metadata.name === name);

  return { dir, files, find, texts };
}

interface Resource {
  readonly kind: string;
  readonly metadata: { readonly name: string };
  readonly spec?: {
    readonly template?: { readonly spec: { readonly containers: readonly Container[] } };
  };
  readonly data?: Readonly<Record<string, string>>;
}

interface Container {
  readonly image: string;
}

test('it lists every manifest in the kustomization but the example Secret', async () => {
  const ctx = await setupTest();

  const entries = await readdir(ctx.dir);

  expect([...ctx.files, 'kustomization.yaml', 'secret.example.yaml']).toIncludeSameMembers(
    entries.filter((file) => file.endsWith('.yaml')),
  );
});

test('it holds a configuration that nixie’s schema accepts', async () => {
  const ctx = await setupTest();

  const text = ctx.find('ConfigMap', 'nixie-config')?.data?.['config.yaml'] ?? '';

  expect(deploymentConfigSchema.safeParse(Bun.YAML.parse(text)).success).toBeTrue();
});

test('it runs nixie as one replica on a ReadWriteOnce volume, with its files read-only', async () => {
  const ctx = await setupTest();

  expect(ctx.find('StatefulSet', 'nixie')?.spec).toMatchObject({
    replicas: 1,
    updateStrategy: { type: 'RollingUpdate' },
    volumeClaimTemplates: [
      { metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'] } },
    ],
    template: {
      spec: {
        containers: [
          {
            name: 'nixie',
            securityContext: { readOnlyRootFilesystem: true },
            volumeMounts: expect.arrayContaining([
              { name: 'data', mountPath: '/data' },
              { name: 'etc', mountPath: '/etc/nixie', readOnly: true },
            ]),
          },
        ],
        volumes: expect.arrayContaining([
          {
            name: 'etc',
            projected: {
              sources: [
                {
                  configMap: {
                    name: 'nixie-config',
                    items: [{ key: 'config.yaml', path: 'config.yaml' }],
                  },
                },
                {
                  secret: {
                    name: 'nixie-secrets',
                    items: [
                      { key: 'secrets.yaml', path: 'secrets.yaml', mode: 0o440 },
                      { key: 'age.key', path: 'age.key', mode: 0o440 },
                    ],
                  },
                },
              ],
            },
          },
        ]),
      },
    },
  });
});

test('it names the nixie and web images of one release by tag and digest', async () => {
  const ctx = await setupTest();

  const images = [ctx.find('StatefulSet', 'nixie'), ctx.find('Deployment', 'nixie-web')].map(
    (resource) => resource?.spec?.template?.spec.containers[0]?.image ?? '',
  );
  const versions = images.map((image) => /:(?<version>[\d.]+)@/u.exec(image)?.groups?.['version']);

  expect(images).toSatisfyAll((image: string) =>
    /^ghcr\.io\/zgeoff\/nixie(?:-web)?:\d+\.\d+\.\d+@sha256:[\da-f]{64}$/u.test(image),
  );
  expect(versions[0]).toBe(versions[1]);
});

test('it routes /rpc to nixie and every other path to the web client on one host name', async () => {
  const ctx = await setupTest();

  expect(ctx.find('Ingress', 'nixie')?.spec).toMatchObject({
    rules: [
      {
        host: 'nixie.example.com',
        http: {
          paths: [
            {
              path: '/rpc',
              pathType: 'Prefix',
              backend: { service: { name: 'nixie', port: { name: 'http' } } },
            },
            {
              path: '/',
              pathType: 'Prefix',
              backend: { service: { name: 'nixie-web', port: { name: 'http' } } },
            },
          ],
        },
      },
    ],
  });
});

// a name of 3 or more labels, such as a node's or a tailnet's, is a host; a file name has 2
test('it names no host outside the example domain, the registry and the model provider', async () => {
  const ctx = await setupTest();

  const hosts = ctx.texts.flatMap((text) =>
    [...text.matchAll(/(?<host>[a-z\d-]+(?:\.[a-z\d-]+)+\.[a-z]{2,})/gu)].map(
      (match) => match.groups?.['host'] ?? '',
    ),
  );

  expect(hosts).toSatisfyAll((host: string) =>
    ['example.com', 'ghcr.io', 'api.anthropic.com', 'kubernetes.io', 'k8s.io'].some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    ),
  );
});
