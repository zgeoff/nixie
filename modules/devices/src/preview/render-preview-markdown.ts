// Markdown as the markup of the preview page. Raw HTML in the text stays text, and a link or an
// image becomes its words, because the render fetches nothing.
export function renderPreviewMarkdown(markdown: string): string {
  return Bun.markdown
    .html(markdown, { noHtmlBlocks: true, noHtmlSpans: true })
    .replaceAll(/<a\b[^>]*>/gu, '<span>')
    .replaceAll('</a>', '</span>')
    .replaceAll(/<img\b[^>]*\balt="(?<alt>[^"]*)"[^>]*>/gu, '$<alt>')
    .replaceAll(/<img\b[^>]*>/gu, '');
}
