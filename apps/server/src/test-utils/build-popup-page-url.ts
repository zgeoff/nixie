// The URL of a page whose one button covers the window and opens a second browser window over the
// middle of the display when something clicks it.
export function buildPopupPageURL(title: string): string {
  const page = [
    `<title>${title}</title>`,
    '<body style="margin:0">',
    '<button style="position:fixed;inset:0;width:100%;height:100%"',
    ` onclick="window.open('about:blank','second','popup,width=360,height=240,left=460,top=280')">`,
    'press</button>',
    '</body>',
  ].join('');

  return `data:text/html,${encodeURIComponent(page)}`;
}
