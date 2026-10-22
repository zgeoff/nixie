import type { SkillExportSweep } from '@heynixie/definitions';
import { startSkillExportSweep } from '@heynixie/definitions';
import { buildGitHubDefinitionsRepo } from '@heynixie/definitions-github';
import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { DefinitionsExportSettings } from './resolve-definitions-export';
import type { Cleanup } from './types';

export interface SkillExportsOptions {
  readonly log: Log;
  readonly settings: DefinitionsExportSettings | null;
  readonly cleanup: Cleanup;

  readonly logEvent: Logger;
}

export async function startSkillExports(
  options: SkillExportsOptions,
): Promise<SkillExportSweep | null> {
  if (options.settings === null) {
    return null;
  }

  const sweep = startSkillExportSweep({
    log: options.log,
    repo: buildGitHubDefinitionsRepo(options.settings.repo),
    text: options.settings.text,
    onError: (error) => {
      options.logEvent('skills.export_failed', toErrorFields(error), 'error');
    },
  });

  await options.cleanup.defer(() => sweep.stop());

  return sweep;
}
