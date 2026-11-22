// The URL of a page whose one button covers the window and renames the page to "clicked" when
// something clicks it.
export function buildButtonPageURL(title: string): string {
  const page = [
    `<title>${title}</title>`,
    '<body style="margin:0">',
    '<button style="position:fixed;inset:0;width:100%;height:100%"',
    ` onclick="document.title='clicked'">press</button>`,
    '</body>',
  ].join('');

  return `data:text/html,${encodeURIComponent(page)}`;
}
