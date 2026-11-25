import { z } from 'zod';

const nameSource = String.raw`(?:@[a-z0-9~-][a-z0-9._~-]*/)?[a-z0-9~-][a-z0-9._~-]*`;

// SemVer 2.0.0: no leading zero in a number or a numeric pre-release identifier, and no empty
// identifier
const numberSource = String.raw`(?:0|[1-9]\d*)`;
const preReleaseIdentifierSource = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const buildIdentifierSource = String.raw`[0-9A-Za-z-]+`;

const versionSource =
  `${numberSource}\\.${numberSource}\\.${numberSource}` +
  `(?:-${preReleaseIdentifierSource}(?:\\.${preReleaseIdentifierSource})*)?` +
  `(?:\\+${buildIdentifierSource}(?:\\.${buildIdentifierSource})*)?`;

const nameSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(new RegExp(`^${nameSource}$`, 'u'));

const versionSchema = z
  .string()
  .min(5)
  .max(64)
  .regex(new RegExp(`^${versionSource}$`, 'u'));

// A package of a page as 'name@version': a valid npm name and an exact version, with no range and
// no tag.
export const packageSpecSchema = z
  .string()
  .max(300)
  .regex(new RegExp(`^${nameSource}@${versionSource}$`, 'u'));

export const packageInputSchema = z.object({ name: nameSchema, version: versionSchema });

export interface PackageSpec {
  readonly name: string;
  readonly version: string;
}

// The name and the version of a package spec, or null for a string that is none.
export function parsePackageSpec(spec: string): PackageSpec | null {
  if (!packageSpecSchema.safeParse(spec).success) {
    return null;
  }

  const at = spec.lastIndexOf('@');

  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}
