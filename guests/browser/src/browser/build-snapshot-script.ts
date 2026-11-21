// The script that runs inside a page and reads it. It writes the page's text with a link mark where
// each link ends, and in snapshot mode an `[E4 textbox "Name"]` tag where a control stands, after
// it numbers the controls on the page itself. The browser has no DOM types here, so it is a string.
export function buildSnapshotScript(mode: 'text' | 'snapshot'): string {
  return `(() => {
  const mode = ${JSON.stringify(mode)};
  const open = '\\uE000';
  const close = '\\uE001';
  for (const old of document.querySelectorAll('[data-nixie-e]')) old.removeAttribute('data-nixie-e');
  const links = [];
  const out = [];
  let count = 0;
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG']);
  const blocks = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'TR', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER',
    'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FORM', 'BR', 'HR', 'PRE',
    'BLOCKQUOTE']);
  const isHidden = (el) => {
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || el.hasAttribute('hidden');
  };
  const isWebLink = (el) => el.tagName === 'A' && !el.hasAttribute('download') && /^https?:/i.test(el.href || '');
  const labelOf = (el) => {
    const labelled = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    const text = el.getAttribute('aria-label') || labelled || el.getAttribute('placeholder') ||
      el.innerText || el.value || el.getAttribute('name') || el.getAttribute('title') || '';
    return String(text).trim().replace(/\\s+/g, ' ').slice(0, 80).replace(/"/g, "'");
  };
  const roleOf = (el) => {
    const tag = el.tagName;
    if (tag === 'A') {
      if (isWebLink(el)) return 'link';
      return el.hasAttribute('download') || el.hasAttribute('onclick') || el.getAttribute('role') === 'button' ? 'button' : null;
    }
    if (tag === 'BUTTON') return 'button';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') {
      const kind = (el.type || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(kind)) return 'button';
      if (kind === 'checkbox' || kind === 'radio') return kind;
      if (kind === 'hidden' || kind === 'file') return null;
      return 'textbox';
    }
    const role = el.getAttribute('role');
    if (role === 'button' || role === 'checkbox' || role === 'textbox' || role === 'tab' || role === 'menuitem') return role;
    return el.hasAttribute('onclick') ? 'button' : null;
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      out.push(node.textContent.replace(/[\\uE000\\uE001]/g, ''));
      return;
    }
    if (node.nodeType !== 1 || skipped.has(node.tagName.toUpperCase()) || isHidden(node)) return;
    const isBlock = blocks.has(node.tagName);
    if (isBlock) out.push('\\n');
    if (isWebLink(node)) {
      for (const child of node.childNodes) walk(child);
      links.push(node.href);
      out.push(open + (links.length - 1) + close);
      return;
    }
    const role = roleOf(node);
    if (mode === 'snapshot' && role !== null) {
      count += 1;
      const id = 'E' + count;
      node.setAttribute('data-nixie-e', id);
      const isSecret = node.type === 'password';
      const shown = role === 'textbox' && node.value && !isSecret ? ' value="' + String(node.value).slice(0, 40).replace(/"/g, "'") + '"' : '';
      out.push(' [' + id + ' ' + role + ' "' + labelOf(node) + '"' + shown + '] ');
      return;
    }
    for (const child of node.childNodes) walk(child);
    if (isBlock) out.push('\\n');
  };
  walk(document.body);
  const text = out.join('').replace(/[ \\t\\f\\v]+/g, ' ').replace(/ ?\\n ?/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
  return JSON.stringify({ title: document.title, text, links, url: location.href });
})()`;
}
