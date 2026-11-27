import type { ComputerReply } from '@heynixie/wire';
import { z } from 'zod';
import { toSelector } from './act-on-tab';
import type { Tab } from './types';

const elementSchema = z.object({
  role: z.string(),
  href: z.string().nullable(),
  isInForm: z.boolean(),
  hasClickHandler: z.boolean(),
});

// Reads what a click on a numbered control would reach: whether it is a plain web link, where it
// points, whether it sits in a form and whether it carries a click handler.
export async function readTabElement(tab: Tab, element: string): Promise<ComputerReply> {
  const json: unknown = await tab.page.evaluate(`(() => {
  const el = document.querySelector('${toSelector(element)}');
  if (!el) return null;
  const isWebLink = el.tagName === 'A' && !el.hasAttribute('download') && /^https?:/i.test(el.href || '');
  const aria = el.getAttribute('role');
  return JSON.stringify({
    role: isWebLink ? 'link' : (aria || el.tagName.toLowerCase()),
    href: isWebLink ? el.href : null,
    isInForm: Boolean(el.form || el.closest('form')),
    hasClickHandler: el.hasAttribute('onclick') || aria === 'button',
  });
})()`);

  if (typeof json !== 'string') {
    return { kind: 'failed', ok: false, reason: 'stale_element' };
  }

  return { kind: 'element', ok: true, element: elementSchema.parse(JSON.parse(json)) };
}
