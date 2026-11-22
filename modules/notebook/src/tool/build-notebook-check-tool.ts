import type { ToolDefinition } from '@heynixie/tools';
import { cutResultLists } from './cut-result-lists';
import type { NotebookToolStore } from './notebook-tool-store';
import { ownerData, untrusted } from './one-line-pattern';

export function buildNotebookCheckTool(readStore: () => NotebookToolStore): ToolDefinition {
  return {
    name: 'notebook.check',
    description:
      'Checks the notebook for what you can fix: orphans, notes with no link out and none in; ' +
      'dangling links, whose target was forgotten or destroyed; and repeated reasons, a related ' +
      'link reason that sits on many links. A note that another note names only in its text, ' +
      'and not with notebook.link, counts as an orphan, because only notebook.link makes a link. ' +
      'Each list holds at most 50 entries, oldest edit first, and the counts give each total. ' +
      'nixie never pushes this report: read it when you tidy, or set yourself a reminder to. ' +
      'Find old notes with notebook.find and order: oldest.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      type: 'object',
      properties: {
        orphans: { type: 'array' },
        dangling: { type: 'array' },
        repeatedReasons: { type: 'array' },
        orphanCount: { type: 'integer' },
        danglingCount: { type: 'integer' },
        repeatedReasonCount: { type: 'integer' },
      },
      required: [
        'orphans',
        'dangling',
        'repeatedReasons',
        'orphanCount',
        'danglingCount',
        'repeatedReasonCount',
      ],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        orphans: untrusted,
        dangling: untrusted,
        repeatedReasons: untrusted,
        orphanCount: ownerData,
        danglingCount: ownerData,
        repeatedReasonCount: ownerData,
      },
    },
    execution: 'direct',
    run: async () => {
      const check = await readStore().readCheck();

      const result = cutResultLists(
        {
          orphans: check.orphans.map((orphan) => ({ ...orphan })),
          dangling: check.dangling.map((entry) => ({
            from: entry.from,
            to: { ...entry.to },
            type: entry.type,
          })),
          repeatedReasons: check.repeatedReasons.map((entry) => ({
            reason: entry.reason,
            count: entry.count,
            links: entry.links.map((link) => ({ from: link.from, to: { ...link.to } })),
          })),
          orphanCount: check.orphanCount,
          danglingCount: check.danglingCount,
          repeatedReasonCount: check.repeatedReasonCount,
        },
        ['orphans', 'dangling', 'repeatedReasons'],
      );

      return {
        status: 'ok',
        result,
        record: {
          orphanCount: check.orphanCount,
          danglingCount: check.danglingCount,
          repeatedReasonCount: check.repeatedReasonCount,
        },
      };
    },
  };
}
