// The URL of the version's tarball, which nixie builds itself and never takes from the registry's
// document, so the download stays on the registry's own host.
export function buildTarballURL(registry: string, name: string, version: string): string {
  const base = name.split('/').pop() ?? name;

  return `${registry}/${name}/-/${base}-${version}.tgz`;
}
