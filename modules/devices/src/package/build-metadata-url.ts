// The URL of the registry's document for one version of a package.
export function buildMetadataURL(registry: string, name: string, version: string): string {
  return `${registry}/${name.replace('/', '%2F')}/${version}`;
}
