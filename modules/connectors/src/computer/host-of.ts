export function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : url;
}
