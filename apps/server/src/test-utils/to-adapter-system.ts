// The system an adapter reaches, from its folder name `<interface>-<system>`.
export function toAdapterSystem(folder: string): string {
  return folder.split('-').slice(1).join('-');
}
