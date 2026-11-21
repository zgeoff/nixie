import type { ReadTemplateOptions } from '@zgeoff/testing/fs';
import { readTemplate } from '@zgeoff/testing/fs';
import { pointTmpdirAtMemory } from '../memory/point-tmpdir-at-memory';
import { buildTemplateName } from './build-template-name';

export interface TestTemplateOptions extends ReadTemplateOptions {
  // the checkout whose absolute paths the build bakes in; the inputs' root when it is left out
  readonly checkout?: string;
}

// A script that fills a template before the run reads the temp folder that the run points at memory,
// so it points there too. The kit shares that folder across checkouts, and a build bakes in the
// paths of its checkout, so the checkout's path joins the name.
export function readTestTemplate(options: TestTemplateOptions): Promise<string> {
  pointTmpdirAtMemory(process.env);

  const { checkout, ...kitOptions } = options;

  return readTemplate({
    ...kitOptions,
    name: buildTemplateName(options.name, checkout ?? options.root),
  });
}
