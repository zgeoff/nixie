import { z } from 'zod';
import { deploymentConfigSchema } from './deployment-config-schema';

export type PreviewRouteConfig =
  | { readonly ok: true; readonly config: string }
  | { readonly ok: false; readonly error: string };

const routeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);

// the deployment schema renames and fills in fields, so the route goes on the file's own shape,
// which the schema checks before and after
const profileSchema = z.looseObject({ base_url: z.string() });
const modelsSchema = z.looseObject({ profiles: z.record(z.string(), profileSchema) });
const profilesSchema = z.looseObject({ models: modelsSchema });

export function buildPreviewRouteConfig(route: string, text: string): PreviewRouteConfig {
  if (!routeSchema.safeParse(route).success) {
    return {
      ok: false,
      error: `NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not '${route}'`,
    };
  }

  const raw = parseYAMLOrNull(text);
  const parsed = profilesSchema.safeParse(raw);

  if (!parsed.success || !deploymentConfigSchema.safeParse(raw).success) {
    return {
      ok: false,
      error: 'the preview config is not a deployment config with model profiles',
    };
  }

  // a host's counting proxy serves the route at the model API's own host, so the route only
  // extends each profile's base URL
  const profiles = Object.fromEntries(
    Object.entries(parsed.data.models.profiles).map(([name, profile]) => [
      name,
      { ...profile, base_url: `${profile.base_url.replace(/\/+$/u, '')}/${route}` },
    ]),
  );

  const routed = { ...parsed.data, models: { ...parsed.data.models, profiles } };

  return { ok: true, config: Bun.YAML.stringify(routed, null, 2) };
}

function parseYAMLOrNull(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    return null;
  }
}
