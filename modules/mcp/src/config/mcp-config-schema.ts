import { parseCIDR } from '@heynixie/egress';
import { z } from 'zod';
import { isRefusedRange } from '../facts/is-refused-range';
import { reservedServerIDs } from './reserved-server-ids';

export const serverIDPattern = /^[a-z][a-z0-9]{1,15}$/u;
const defaultListingTimeoutSeconds = 10;

export type McpServerConfig = z.output<ReturnType<typeof buildServerSchema>>;

// The mcp section of config.yaml: each server is one entry under its ID, which prefixes every tool
// name. An ID that is the first segment of a tool nixie registers is refused at the load.
export function buildMcpConfigSchema(isTestBuild: boolean) {
  return z.strictObject({
    listingTimeoutSeconds: z.number().int().positive().default(defaultListingTimeoutSeconds),
    servers: z
      .record(
        z
          .string()
          .refine((id) => serverIDPattern.test(id), {
            message: 'a server ID matches ^[a-z][a-z0-9]{1,15}$',
          })
          .refine((id) => !reservedServerIDs.includes(id), {
            message: 'a server ID is not the first segment of a tool nixie registers, such as web',
          }),
        buildServerSchema(isTestBuild),
      )
      .default({}),
  });
}

// A test build accepts http and a range that holds a loopback address, for the stand-in server.
export const mcpConfigSchema = buildMcpConfigSchema(NIXIE_TEST_BUILD);

export type McpConfig = z.output<typeof mcpConfigSchema>;

function buildServerSchema(isTestBuild: boolean) {
  return z
    .strictObject({
      url: z.string().min(1),
      clientID: z.string().min(1),
      scope: z.string().min(1),
      trusted: z.boolean().default(false),
      privateRange: z.string().nullable().default(null),
    })
    .superRefine((server, issues) => {
      const reason = findUnfitURL(server.url, isTestBuild);

      if (reason !== null) {
        issues.addIssue({ code: 'custom', path: ['url'], message: reason });
      }

      if (server.privateRange !== null) {
        const rangeReason = findUnfitRange(server.privateRange, isTestBuild);

        if (rangeReason !== null) {
          issues.addIssue({ code: 'custom', path: ['privateRange'], message: rangeReason });
        }
      }
    });
}

function findUnfitURL(text: string, isTestBuild: boolean): string | null {
  if (!URL.canParse(text)) {
    return 'the url is not a URL';
  }

  const url = new URL(text);

  if (url.protocol !== 'https:' && !(isTestBuild && url.protocol === 'http:')) {
    return 'the url is https';
  }

  if (url.username !== '' || url.password !== '') {
    return 'the url holds no user name or password';
  }

  if (url.search !== '' || url.hash !== '') {
    return 'the url holds no query or fragment';
  }

  return null;
}

function findUnfitRange(text: string, isTestBuild: boolean): string | null {
  const range = parseCIDR(text);

  if (range === null) {
    return 'the privateRange is one CIDR range, such as 10.0.0.0/24';
  }

  if (!isTestBuild && isRefusedRange(range)) {
    return 'the privateRange holds a loopback, link-local or unspecified address';
  }

  return null;
}
