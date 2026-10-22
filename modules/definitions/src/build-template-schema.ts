import { z } from 'zod';
import { templatePlaceholderPattern } from './template-placeholder-pattern';

export function buildTemplateSchema(placeholders: readonly string[]) {
  const known = placeholders.map((placeholder) => `{${placeholder}}`).join(', ');

  return z
    .string()
    .min(1)
    .superRefine((template, ctx) => {
      for (const [placeholder] of template.matchAll(templatePlaceholderPattern)) {
        if (!placeholders.includes(placeholder.slice(1, -1))) {
          ctx.addIssue({
            code: 'custom',
            message: `unknown placeholder ${placeholder}; use ${known}`,
          });
        }
      }
    });
}
