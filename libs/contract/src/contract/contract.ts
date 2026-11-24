import { oc } from '@orpc/contract';
import { z } from 'zod';
import { codeFileSchema } from '../file/code-file-schema';
import { spanSchema } from '../span/span-schema';
import { approvalContract } from './approval-contract';
import { computerContract } from './computer-contract';
import { definitionsContract } from './definitions-contract';
import { devicesContract } from './devices-contract';
import { erasureContract } from './erasure-contract';
import { followLive } from './follow-live';
import { forgetBackupSchema } from './forget-backup-schema';
import { imageNotFoundError } from './image-not-found-error';
import { imageRefusedError } from './image-refused-error';
import { imagesContract } from './images-contract';
import {
  actionCountSchema,
  listedStateSchema,
  listedTaskSchema,
  taskStateSchema,
} from './listed-task-schema';
import { memoryViewContract } from './memory-view-contract';
import { notebookContract } from './notebook-contract';
import { passkeyContract } from './passkey-contract';
import { pauseStateSchema } from './pause-state-schema';
import { readPayloadContract } from './read-payload-contract';
import {
  listedActionSchema,
  recordSchema,
  versionRefSchema,
  versionTextSchema,
} from './record-schema';
import { recoverySchema } from './recovery-schema';
import { remindersContract } from './reminders-contract';
import { reusedIDErrors } from './reused-id-errors';
import { ruleContract } from './rule-contract';
import { sequenceSchema } from './sequence-schema';
import { signedIn } from './signed-in';
import {
  spendRaiseInputSchema,
  spendRaiseOutputSchema,
  spendStopSchema,
  spendStopStandsError,
} from './spend-stop-schema';
import { threadSchema } from './thread-schema';
import { viewContract } from './view-contract';

const clientActionIDSchema = z.uuid();
const sessionScopeSchema = z.enum(['full', 'device']);
const imageFilesSchema = z.array(z.file());

const imageRefSchema = z.object({
  position: z.int().nonnegative(),
  sequence: sequenceSchema,
  thread: threadSchema,
});

const writerErrorSchema = z
  .object({ at: z.date(), code: z.string(), message: z.string().nullable() })
  .nullable();

const sessionSchema = z.object({
  createdAt: z.date(),
  current: z.boolean(),
  deviceName: z.string(),
  lastUsedAt: z.date(),
  sessionID: z.uuid(),
});

const checkedAction = signedIn.errors(reusedIDErrors);
const forgetPreviewItemSchema = z.object({ itemID: z.string(), text: z.string() });

// a private note's title is left out
const linkingNoteSchema = z.object({ note: z.string(), title: z.string().optional() });

const recordForgetPreviewSchema = z.object({
  momentCount: actionCountSchema,
  memoryItems: z.array(forgetPreviewItemSchema),

  // the active notes that link to the record
  notes: z.array(linkingNoteSchema),
});

const controlledTaskSchema = z.object({
  controlledAt: z.date(),
  isPauseRequested: z.boolean(),
  state: taskStateSchema,
  taskID: threadSchema,
});

const taskControl = checkedAction
  .errors({
    TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 },
    TASK_STATE_REFUSED: {
      message: 'The task is in a state that does not take this control',
      status: 409,
      data: z.object({ isPauseRequested: z.boolean(), state: taskStateSchema }),
    },
    RUNNER_LACKS_CONTROL: {
      message: 'The runner of the task does not take this control',
      status: 409,
    },
  })
  .input(z.object({ clientActionID: clientActionIDSchema, taskID: threadSchema }))
  .output(controlledTaskSchema);

const markedTaskSchema = z.object({
  changedAt: z.date(),
  disposable: z.boolean(),
  taskID: threadSchema,
});

const nixieControl = checkedAction
  .input(z.object({ clientActionID: clientActionIDSchema }))
  .output(z.object({ paused: pauseStateSchema }));

const spendStopErrors = { SPEND_STOP_STANDS: spendStopStandsError };

const backupNoticeSchema = z.object({
  cause: z.enum(['failed', 'missing']),
  sequence: z.int().positive(),
  raisedAt: z.date(),
});

export const contract = {
  conversation: {
    read: signedIn
      .errors({ THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 } })
      .input(
        z.object({
          beforeSequence: sequenceSchema.optional(),
          clipPayloads: z.boolean().optional(),
          limit: z.int().min(1).max(200).optional(),
          thread: threadSchema,
        }),
      )
      .output(
        z.object({
          hasEarlier: z.boolean(),
          readAtSequence: sequenceSchema,
          records: z.array(recordSchema),

          lastStepEnd: recordSchema.nullable().optional(),
        }),
      ),

    send: checkedAction
      .errors({
        IMAGE_REFUSED: imageRefusedError,
        THREAD_NOT_FOUND: { message: 'No thread has this ID', status: 404 },
      })
      .input(
        z.object({
          clientMessageId: clientActionIDSchema,

          images: imageFilesSchema.optional(),
          spans: z.array(spanSchema).max(100_000),
          text: z.string().min(1).max(100_000),
          thread: threadSchema,

          timeZone: z.string().min(1).max(100).optional(),

          writtenAt: z.iso.datetime().optional(),
        }),
      )
      .output(z.object({ duplicate: z.boolean(), sequence: sequenceSchema })),

    retry: checkedAction
      .errors({
        NOTHING_TO_RETRY: {
          message: 'The last turn of the conversation did not fail, or it runs again already',
          status: 409,
        },
      })
      .input(z.object({ clientActionID: clientActionIDSchema }))
      .output(z.object({ retriedAt: z.date() })),

    readImage: signedIn
      .errors({ IMAGE_NOT_FOUND: imageNotFoundError })
      .input(imageRefSchema)
      .output(z.file()),

    previewForget: signedIn
      .errors({
        RECORD_NOT_FOUND: {
          message:
            'No record on this thread with its own text that a forget removes has this sequence',
          status: 404,
        },
      })
      .input(z.object({ thread: threadSchema, sequence: sequenceSchema }))
      .output(recordForgetPreviewSchema),

    forget: checkedAction
      .errors({
        RECORD_NOT_FOUND: {
          message:
            'No record on this thread with its own text that a forget removes has this sequence',
          status: 404,
        },
        ACTION_NOT_FINISHED: {
          message: 'The queued action has not run yet. Cancel it, or wait for it to run.',
          status: 409,
        },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          sequence: sequenceSchema,
          thread: threadSchema,
        }),
      )
      .output(z.object({ forgottenAt: z.date(), backup: forgetBackupSchema })),
  },
  tasks: {
    list: signedIn
      .input(
        z
          .object({
            definitionID: z.string().min(1).max(200).optional(),
            states: z
              .array(listedStateSchema)
              .min(1)
              .max(11)
              .refine((states) => new Set(states).size === states.length, {
                message: 'Each state may appear once',
              })
              .optional(),
          })
          .optional(),
      )
      .output(
        z.object({
          readAtSequence: sequenceSchema,
          tasks: z.array(listedTaskSchema),

          // the earliest time a listed task changes with no write
          changesAt: z.date().nullable(),
        }),
      ),
    read: signedIn
      .errors({ TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 } })
      .input(z.object({ taskID: threadSchema }))
      .output(listedTaskSchema),
    readActions: signedIn
      .errors({ TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 } })
      .input(z.object({ taskID: threadSchema }))
      .output(
        z.object({
          queued: z.array(listedActionSchema),
          started: z.array(listedActionSchema),
        }),
      ),
    pause: taskControl,
    resume: taskControl.errors(spendStopErrors),
    stop: taskControl,
    restart: taskControl,
    close: taskControl.errors({
      CONVERSATION_NEVER_CLOSES: { message: 'The conversation is never closed', status: 409 },
      DEFINITION_TASK_NEVER_CLOSES: {
        message: 'The task of a definition is never closed',
        status: 409,
      },
    }),
    interrupt: taskControl,
    setDisposable: checkedAction
      .errors({
        TASK_NOT_FOUND: { message: 'No task has this ID', status: 404 },
        TASK_HAS_NO_MARK: { message: 'The task has no disposable mark', status: 409 },
        TASK_STATE_REFUSED: {
          message: 'The task is in a state that does not take this change',
          status: 409,
          data: z.object({ state: taskStateSchema }),
        },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          disposable: z.boolean(),
          taskID: threadSchema,
        }),
      )
      .output(markedTaskSchema),

    ...viewContract.tasks,
  },
  memory: {
    readVersions: signedIn
      .input(z.object({ versions: z.array(versionRefSchema).min(1).max(100) }))
      .output(z.object({ versions: z.array(versionTextSchema) })),

    writerStatus: signedIn.route({ deprecated: true }).output(
      z.object({
        isEnabled: z.boolean(),
        backlog: z.int().nonnegative(),
        batches: z.int().nonnegative(),
        cursor: sequenceSchema,
        failures: z.int().nonnegative(),
        isCatchingUp: z.boolean(),
        lastError: writerErrorSchema,
        retryAt: z.date().nullable(),
      }),
    ),

    ...memoryViewContract,
  },
  notebook: notebookContract,
  images: imagesContract,
  computer: computerContract,
  files: {
    read: signedIn
      .errors({
        FILE_NOT_FOUND: { message: 'No code-run file or image has this ID', status: 404 },
        FILE_FORGOTTEN: { message: 'A forget made this file unreadable', status: 410 },
      })
      .input(z.object({ file: z.string().min(1).max(100) }))
      .output(z.file()),
    list: signedIn
      .input(
        z.object({
          cursor: z
            .string()
            .max(100)
            .regex(/^\d+:\d+$/u)
            .optional(),
          kind: z.enum(['image', 'other']).optional(),
        }),
      )
      .output(
        z.object({
          files: z.array(codeFileSchema).max(30),
          nextCursor: z.string().nullable(),
        }),
      ),
  },
  nixie: {
    read: signedIn.output(z.object({ paused: pauseStateSchema })),
    pause: nixieControl,
    resume: nixieControl.errors(spendStopErrors),
  },
  spend: {
    read: signedIn.output(spendStopSchema),
    raise: signedIn.input(spendRaiseInputSchema).output(spendRaiseOutputSchema),
  },
  recovery: {
    read: signedIn.output(z.object({ recovery: recoverySchema })),
  },
  backups: {
    readNotice: signedIn.output(z.object({ notice: backupNoticeSchema.nullable() })),
  },
  triggers: viewContract.triggers,
  reminders: remindersContract,
  definitions: { ...viewContract.definitions, ...definitionsContract },
  devices: devicesContract,
  erasure: erasureContract,
  rules: ruleContract,
  approvals: approvalContract,
  passkeys: passkeyContract,
  live: { follow: followLive },
  records: { readPayload: readPayloadContract },
  sessions: {
    enrol: oc
      .errors(reusedIDErrors)
      .errors({
        ENROLMENT_CODE_INVALID: {
          message: 'The enrolment code is unknown, used or lapsed',
          status: 400,
        },
      })
      .input(
        z.object({
          clientActionID: clientActionIDSchema,
          code: z.string().min(1).max(100),
          deviceName: z.string().min(1).max(100),
          tokenDelivery: z.enum(['cookie', 'bearer']),
        }),
      )
      .output(
        z.object({
          scope: sessionScopeSchema.optional(),
          sessionID: z.uuid(),
          token: z.string().optional(),
        }),
      ),

    issueCode: checkedAction
      .input(
        z.object({ clientActionID: clientActionIDSchema, scope: sessionScopeSchema.optional() }),
      )
      .output(z.object({ code: z.string(), expiresAt: z.date() })),

    // The client calls it when it shows nixie on screen, and every 60 s while it does.
    shown: signedIn.input(z.object({})).output(z.object({})),
    signOut: signedIn.input(z.object({})).output(z.object({ signedOutAt: z.date() })),
    list: signedIn.output(z.object({ sessions: z.array(sessionSchema) })),

    revoke: checkedAction
      .errors({ SESSION_NOT_FOUND: { message: 'No session has this ID', status: 404 } })
      .input(z.object({ clientActionID: clientActionIDSchema, sessionID: z.uuid() }))
      .output(z.object({ revokedAt: z.date() })),
  },
};
