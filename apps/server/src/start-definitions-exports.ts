import type { DefinitionsExportSweep } from '@heynixie/definitions';
import {
  buildPromptChangeKind,
  buildSkillChangeKind,
  startDefinitionsExportSweep,
} from '@heynixie/definitions';
import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-github';
import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { DefinitionsExportSettings } from './resolve-definitions-export';
import type { Cleanup } from './types';

export interface DefinitionsExportsOptions {
  readonly log: Log;
  readonly settings: DefinitionsExportSettings | null;
  readonly cleanup: Cleanup;

  readonly logEvent: Logger;
}

export async function startDefinitionsExports(
  options: DefinitionsExportsOptions,
): Promise<DefinitionsExportSweep | null> {
  if (options.settings === null) {
    return null;
  }

  const text = options.settings.text;

  const sweep = startDefinitionsExportSweep({
    log: options.log,
    repo: buildGitHubDefinitionsRepo(options.settings.repo),
    kinds: [buildSkillChangeKind(text), buildPromptChangeKind(options.log, text)],
    onError: (error) => {
      options.logEvent('definitions.export_failed', toErrorFields(error), 'error');
    },
  });

  await options.cleanup.defer(() => sweep.stop());

  return sweep;
}
