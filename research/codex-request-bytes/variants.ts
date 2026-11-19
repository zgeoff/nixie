import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { StubOptions } from './start-stub-upstream';

const catalogSchema = z.object({ models: z.array(z.record(z.string(), z.unknown())) });

export type Catalog = z.infer<typeof catalogSchema>;

// One run's change to the config and the catalog that the production guest wrote.
export interface Variant {
  readonly name: string;
  readonly description: string;
  readonly isPlanLogin: boolean;
  readonly stub: StubOptions;

  // a path the profile's base URL ends with after /v1, such as a capture tag
  readonly baseURLTail?: string;
  readonly changeConfig: (config: string, stubURL: string) => string;
  readonly changeCatalog: (catalog: Catalog) => Catalog;
}

export function readCatalog(path: string): Catalog {
  return catalogSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

const unchanged: Pick<Variant, 'changeConfig' | 'changeCatalog'> = {
  changeConfig: (config) => config,
  changeCatalog: (catalog) => catalog,
};

const plainStub: StubOptions = { toolCall: null, userSettings: null };

// The guest before this spike's change: no analytics or feedback table, and the CLI's own text for
// each MCP resource helper.
function removeQuietTables(config: string): string {
  return config.replace('\n[analytics]\nenabled = false\n\n[feedback]\nenabled = false\n', '\n');
}

function removeModelMessages(catalog: Catalog): Catalog {
  return {
    models: catalog.models.map((model) =>
      Object.fromEntries(Object.entries(model).filter(([key]) => key !== 'model_messages')),
    ),
  };
}

// Top-level keys must come before the first table, so each goes right after the first line.
function addTopLevelKeys(config: string, keys: readonly string[]): string {
  const [first, ...rest] = config.split('\n');

  return [first, ...keys, ...rest].join('\n');
}

function addStubBackend(config: string, stubURL: string): string {
  return addTopLevelKeys(config, [
    `chatgpt_base_url = ${JSON.stringify(`${stubURL}/backend-api/`)}`,
  ]);
}

// A tag in the shape the gateway parses: a version 4 UUID and an uncompressed P-256 public key in
// unpadded base64url. The run never decodes it.
const captureID = '3f1c2a9e-5b7d-4e8f-9a6b-2c4d6e8f0a1b';
const captureKey = `B${'A'.repeat(86)}`;

const variants: readonly Variant[] = [
  {
    name: 'before',
    description: 'the config and catalog the guest wrote before this spike, with an API key',
    isPlanLogin: false,
    stub: plainStub,
    changeConfig: removeQuietTables,
    changeCatalog: removeModelMessages,
  },
  {
    name: 'before-plan-backend',
    description: 'before, on a plan login, with the ChatGPT backend pointed at the stub',
    isPlanLogin: true,
    stub: plainStub,
    changeConfig: (config, stubURL) => addStubBackend(removeQuietTables(config), stubURL),
    changeCatalog: removeModelMessages,
  },
  {
    name: 'production',
    description: 'the config and catalog the guest writes, with an API key',
    isPlanLogin: false,
    stub: plainStub,
    ...unchanged,
  },
  {
    name: 'production-plan',
    description: 'production, on a plan login, with the ChatGPT backend left at chatgpt.com',
    isPlanLogin: true,
    stub: plainStub,
    ...unchanged,
  },
  {
    name: 'production-plan-backend',
    description: 'production, on a plan login, with the ChatGPT backend pointed at the stub',
    isPlanLogin: true,
    stub: plainStub,
    changeConfig: addStubBackend,
    changeCatalog: (catalog) => catalog,
  },
  {
    name: 'attribution-plan-backend',
    description: 'production-plan-backend, with an account whose settings turn on commit attribution',
    isPlanLogin: true,
    stub: { toolCall: null, userSettings: { commit_attribution_enabled: true } },
    changeConfig: addStubBackend,
    changeCatalog: (catalog) => catalog,
  },
  {
    name: 'attribution-closed-backend',
    description:
      'attribution-plan-backend, with chatgpt_base_url at a closed loopback port in place of the stub',
    isPlanLogin: true,
    stub: { toolCall: null, userSettings: { commit_attribution_enabled: true } },
    changeConfig: (config) =>
      addTopLevelKeys(config, ['chatgpt_base_url = "http://127.0.0.1:9/backend-api/"']),
    changeCatalog: (catalog) => catalog,
  },
  {
    name: 'tool-call',
    description: 'production, with a first reply that calls time.now, so a second request follows',
    isPlanLogin: false,
    stub: { toolCall: { namespace: 'mcp__nixie', name: 'time_now' }, userSettings: null },
    ...unchanged,
  },
  {
    name: 'bundled-catalog',
    description: "production, without nixie's model catalog, so the CLI uses its bundled entry",
    isPlanLogin: false,
    stub: plainStub,
    changeConfig: (config) =>
      config
        .split('\n')
        .filter((line) => !line.startsWith('model_catalog_json'))
        .join('\n'),
    changeCatalog: (catalog) => catalog,
  },
  {
    name: 'capture-tag',
    description: "production, with a capture tag in the base URL's path, as a turn-input capture sets",
    isPlanLogin: false,
    stub: plainStub,
    baseURLTail: `/~in.${captureID}.${captureKey}`,
    ...unchanged,
  },
];

export function getVariant(name: string): Variant {
  const variant = variants.find((candidate) => candidate.name === name);

  if (variant === undefined) {
    throw new Error(
      `no variant ${name}; pick one of ${variants.map((known) => known.name).join(', ')}`,
    );
  }

  return variant;
}

export function collectVariantNames(): string[] {
  return variants.map((variant) => variant.name);
}
