const tagPattern = /<a\b[^>]*>|<\/a>|<img\b[^>]*>/gu;
const altPattern = /\balt="(?<alt>[^"]*)"/u;

// Markdown as the markup of the preview page. Raw HTML in the text stays text. The render fetches
// nothing, so a link keeps its look with no address, and an image shows as the device shows it: a
// link labelled "image: <alt>", or the label alone inside a link.
export function renderPreviewMarkdown(markdown: string): string {
  const html = Bun.markdown.html(markdown, { noHtmlBlocks: true, noHtmlSpans: true });
  let insideLink = false;

  return html.replaceAll(tagPattern, (tag) => {
    if (tag === '</a>') {
      insideLink = false;

      return tag;
    }

    if (tag.startsWith('<a')) {
      insideLink = true;

      return '<a>';
    }

    const alt = altPattern.exec(tag)?.groups?.['alt'];
    const label = `image: ${alt === undefined || alt === '' ? 'untitled' : alt}`;

    return insideLink ? label : `<a>${label}</a>`;
  });
}
