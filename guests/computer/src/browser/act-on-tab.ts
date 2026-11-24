import type { ComputerAct, ComputerReply, ComputerRequest } from '@heynixie/wire';
import type { Page } from 'playwright-core';
import { z } from 'zod';
import { readTabPage } from './read-tab-page';
import type { Tab } from './types';

const textLimitBytes = 3 * 65_536;

interface FilledField {
  // the control the call filled last, which a submit presses Enter in
  element: string;
}

// Runs the acts of one call on a tab, in order. The page must still hold the URL the call named, a
// control must still hold its number, and a form that posts to another origin never submits.
export async function actOnTab(
  id: string,
  tab: Tab,
  request: Extract<ComputerRequest, { op: 'act' }>,
): Promise<ComputerReply> {
  if (tab.page.url() !== request.expectURL) {
    return { kind: 'failed', ok: false, reason: 'page_changed' };
  }

  const filled: FilledField = { element: '' };

  for (const act of request.acts) {
    const refusal = await runAct(tab.page, act, filled);

    if (refusal !== null) {
      return { kind: 'failed', ok: false, reason: refusal };
    }
  }

  if (request.submit) {
    const refusal = await submitForm(tab.page, filled.element);

    if (refusal !== null) {
      return { kind: 'failed', ok: false, reason: refusal };
    }
  }

  try {
    await tab.page.waitForLoadState('load', { timeout: 10_000 });
  } catch {
    // a page that is still loading is read as it stands
  }

  return readTabPage(id, tab, {
    mode: 'snapshot',
    textBytes: textLimitBytes,
    isDiskNew: false,
    landing: null,
  });
}

type ActRefusal = 'stale_element' | 'cross_origin_submit' | 'failed';

async function runAct(
  page: Page,
  act: ComputerAct,
  filled: FilledField,
): Promise<ActRefusal | null> {
  const locator = page.locator(toSelector(act.element));

  const count = await locator.count();

  if (count !== 1) {
    return 'stale_element';
  }

  try {
    if (act.kind === 'fill') {
      await locator.fill(act.value, { timeout: 10_000 });

      filled.element = act.element;

      return null;
    }

    const form = await readForm(page, act.element);

    if (form.isSubmit && form.origin === 'other') {
      return 'cross_origin_submit';
    }

    await locator.click({ timeout: 10_000 });

    return null;
  } catch {
    return 'failed';
  }
}

export function toSelector(element: string): string {
  return `[data-nixie-e="${element.replaceAll(/[^A-Za-z0-9]/gu, '')}"]`;
}

interface FormFacts {
  readonly isSubmit: boolean;
  readonly origin: string;
}

const formSchema = z.object({ isSubmit: z.boolean(), origin: z.string() });

// whether the control submits a form, and where its form posts
async function readForm(page: Page, element: string): Promise<FormFacts> {
  const selector = toSelector(element);

  const json: unknown = await page.evaluate(`(() => {
  const el = document.querySelector('${selector}');
  if (!el) return null;
  const kind = (el.type || '').toLowerCase();
  const isSubmit = (el.tagName === 'BUTTON' && kind !== 'button' && kind !== 'reset') ||
    (el.tagName === 'INPUT' && (kind === 'submit' || kind === 'image'));
  const form = el.form || el.closest('form');
  const isSame = form ? new URL(form.action, location.href).origin === location.origin : true;
  return JSON.stringify({ isSubmit, origin: isSame ? 'same' : 'other' });
})()`);

  return typeof json === 'string'
    ? formSchema.parse(JSON.parse(json))
    : { isSubmit: false, origin: 'none' };
}

async function submitForm(page: Page, element: string): Promise<ActRefusal | null> {
  const form = await readForm(page, element);

  if (form.origin === 'other') {
    return 'cross_origin_submit';
  }

  try {
    await page.locator(toSelector(element)).press('Enter', { timeout: 10_000 });

    return null;
  } catch {
    return 'failed';
  }
}
