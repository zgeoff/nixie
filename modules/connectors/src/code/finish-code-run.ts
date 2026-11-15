import { createShortID } from '@heynixie/db';
import type { CollectedOutput } from '@heynixie/sandbox';
import type { ToolImage, ToolOutcome, ToolRun } from '@heynixie/tools';
import { ToolResultRefusedError } from '@heynixie/tools';
import { fitFetchedImage } from '../fetch/fit-fetched-image';
import { getPageSession } from '../utils/get-page-session';
import { probeSessionEnded } from '../web/probe-session-ended';
import type { CodeFilesTables } from './code-files-tables';
import { codeRunLimits } from './code-run-limits';
import { codeRunMessages } from './code-run-messages';
import { isFilesLimitPassed, sumBytes } from './collect-out-listing';
import { pickCodeRunLimit } from './pick-code-run-limit';
import { pickMediaType } from './pick-media-type';
import type { CodeSkill } from './resolve-code-run-inputs';
import type { ProgramRun } from './run-code-program';

export interface OutcomeTarget {
  readonly program: ProgramRun;
  readonly run: ToolRun;
  readonly sandboxID: string;
  readonly skills: readonly CodeSkill[];
  readonly imageLongEdge: number;
}

interface StoredFile {
  readonly file: string;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: string;
}

// The result of a code run that the program finished, or that nixie stopped, with its files as
// attachments of the result record and the rows that record them.
export async function finishCodeRun(target: OutcomeTarget): Promise<ToolOutcome> {
  const program = target.program;
  const stdout = program.exit.stdout;
  const stderr = program.exit.stderr;

  const filesPassed = isFilesLimitPassed(program.listed, program.isListingCut)
    ? { count: program.listed.length, bytes: sumBytes(program.listed) }
    : null;

  const limit = pickCodeRunLimit({
    didStop: program.didStop,
    signal: program.exit.signal,
    before: program.before,
    after: program.after,
    cutStreams: [
      ...(stdout.isCut ? (['stdout'] as const) : []),
      ...(stderr.isCut ? (['stderr'] as const) : []),
    ],
    filesPassed,
  });

  const outFiles = program.listed.flatMap((listed, index): readonly StoredFile[] => {
    const bytes = program.copied[index];

    return bytes === undefined
      ? []
      : [
          {
            file: createShortID(),
            path: listed.path,
            bytes,
            mediaType: pickMediaType(listed.path, bytes),
          },
        ];
  });

  const stdoutFile = buildStreamFile('.stdout', stdout);
  const stderrFile = buildStreamFile('.stderr', stderr);
  const stored = [...outFiles, ...[stdoutFile, stderrFile].filter((file) => file !== null)];

  const shown = await readShownImages(target, outFiles);

  return {
    status: 'ok',
    result: {
      exitCode: program.exit.code,
      stdout: buildStreamResult(stdout, stdoutFile),
      stderr: buildStreamResult(stderr, stderrFile),
      files: outFiles.map((file) => ({
        file: file.file,
        path: file.path,
        bytes: file.bytes.byteLength,
        mediaType: file.mediaType,
        isShown: shown.files.has(file.file),
      })),
      limit: limit === null ? null : { kind: limit.kind, sentence: limit.sentence },
      seconds: Math.round(program.exit.durationMs / 100) / 10,
    },
    images: shown.images,
    attachments: stored.map((file) => file.bytes),
    writeBeside: async (tx, resultSequence) => {
      const hasEnded = await probeSessionEnded(tx, getPageSession(target.run));

      if (hasEnded) {
        throw new ToolResultRefusedError(codeRunMessages.sessionEnded);
      }

      if (stored.length === 0) {
        return;
      }

      await tx
        .$extendTables<CodeFilesTables>()
        .insertInto('code_files')
        .values(
          stored.map((file, position) => ({
            file_id: file.file,
            thread: target.run.thread,
            sequence: resultSequence,
            position,
            bytes: file.bytes.byteLength,
            media_type: file.mediaType,
          })),
        )
        .execute();
    },
    hidden: {
      sandbox: target.sandboxID,
      skills: target.skills.map((skill) => ({ name: skill.name, hash: skill.hash })),
    },
  };
}

// A stream past the shown size keeps the stream it collected, up to the exec cap, as a file.
function buildStreamFile(path: string, output: CollectedOutput): StoredFile | null {
  return output.totalBytes > codeRunLimits.shownStreamBytes
    ? { file: createShortID(), path, bytes: output.bytes, mediaType: 'text/plain' }
    : null;
}

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

interface ShownImages {
  readonly images: readonly ToolImage[];

  // the file IDs of the images that reached the model
  readonly files: ReadonlySet<string>;
}

// Up to 4 image files reach the model beside the result, each scaled as a fetched image is and
// counted against the session's image caps.
async function readShownImages(
  target: OutcomeTarget,
  files: readonly StoredFile[],
): Promise<ShownImages> {
  const reserve = target.run.session?.reserveImages;
  const images: ToolImage[] = [];

  const shown = new Set<string>();

  if (reserve === undefined) {
    return { images, files: shown };
  }

  const candidates = files
    .filter((file) => imageTypes.has(file.mediaType))
    .slice(0, codeRunLimits.shownImages);

  for (const file of candidates) {
    const fitted = await fitFetchedImage(file.bytes, target.imageLongEdge);

    if (fitted.kind === 'image' && reserve([fitted.image])) {
      images.push(fitted.image);
      shown.add(file.file);
    }
  }

  return { images, files: shown };
}

function buildStreamResult(output: CollectedOutput, file: StoredFile | null) {
  return {
    text: new TextDecoder().decode(output.bytes.subarray(0, codeRunLimits.shownStreamBytes)),
    bytes: output.totalBytes,
    isCut: output.isCut,
    file: file?.file ?? null,
  };
}
