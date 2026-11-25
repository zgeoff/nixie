const entities = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&nbsp;', ' '],
]);

const linkPattern = /<a\s[^>]*href=["'](?<href>[^"']+)["'][^>]*>(?<label>[\s\S]*?)<\/a>/iu;

// Reads the text of an HTML mail. A link shows its address after its label, so a reset link stays
// readable, and the scripts and the styles go.
export function renderHtmlText(html: string): string {
  return html
    .replaceAll(/<(?<tag>script|style)[\s\S]*?<\/\k<tag>>/giu, '')
    .replaceAll(new RegExp(linkPattern.source, 'giu'), (link) => renderLink(link))
    .replaceAll(/<br\s*\/?>|<\/(?:p|div|tr|li|h[1-6])>/giu, '\n')
    .replaceAll(/<[^>]+>/gu, '')
    .replaceAll(/&(?:amp|lt|gt|quot|nbsp|#39);/gu, (entity) => entities.get(entity) ?? entity)
    .replaceAll(/[ \t]+/gu, ' ')
    .replaceAll(/\n\s*\n\s*\n+/gu, '\n\n')
    .trim();
}

function renderLink(link: string): string {
  const groups = linkPattern.exec(link)?.groups;
  const label = (groups?.['label'] ?? '').replaceAll(/<[^>]+>/gu, '').trim();

  return `${label} (${groups?.['href'] ?? ''})`;
}
