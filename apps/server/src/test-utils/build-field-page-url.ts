// The URL of a page whose one text field covers the window and takes the focus, and that renames the
// page to the field's text, URI-encoded so that a line break shows in the window's title.
export function buildFieldPageURL(title: string): string {
  const page = [
    `<title>${title}</title>`,
    '<body style="margin:0">',
    '<textarea autofocus style="position:fixed;inset:0;width:100%;height:100%"',
    ' oninput="document.title=encodeURIComponent(this.value)"></textarea>',
    '</body>',
  ].join('');

  return `data:text/html,${encodeURIComponent(page)}`;
}
