import { z } from 'zod';

// The bundler keeps a schema built at module level, so a release bundle would hold these names.
export function buildNixieOperationSchemas() {
  const heardSchema = z.object({
    kind: z.literal('heard'),
    text: z.string(),
    startedAtMs: z.number(),
    endedAtMs: z.number(),
  });

  const spokeSchema = z.object({
    kind: z.literal('spoke'),
    text: z.string(),
    heardChars: z.number(),
  });

  const handOffSchema = z.object({
    kind: z.literal('hand_off'),
    handOffID: z.string(),
    request: z.string(),
  });

  const cutSchema = z.object({
    kind: z.literal('cut'),
    handOffID: z.string(),
    heardChars: z.number(),
  });

  const speechEventSchema = z.discriminatedUnion('kind', [
    heardSchema,
    spokeSchema,
    handOffSchema,
    cutSchema,
  ]);

  // the fake provider a credential test reaches, and the credentials it connects
  const credentialProviderSchema = z.object({
    ca: z.string(),
    origin: z.string(),
    tokenURL: z.string(),
    revokeURL: z.string(),
    clientCredentialID: z.string(),
    tokenCredentialID: z.string(),
  });

  return {
    sendMessage: z.object({ thread: z.string(), text: z.string() }),

    // A test that names the task can arm a fault point for it before the task exists.
    createTask: z.object({ brief: z.string(), taskID: z.string().exactOptional() }),
    finishTask: z.object({ taskID: z.string() }),
    controlTask: z.object({
      taskID: z.string(),
      control: z.enum(['pause', 'resume', 'stop', 'restart', 'close', 'interrupt']),
    }),
    releaseWriterLock: z.null(),

    // a call that the user started and connected, on the harness's speech layer
    placeHarnessCall: z.null(),

    // an event that the speech layer's session raises, as the provider would
    emitSpeech: z.object({ sessionID: z.string(), event: speechEventSchema }),

    // what the speech layer was asked to do, in order
    readSpeechCalls: z.null(),

    // the owner's approval of a device page package, which a journey cannot give with a passkey
    approvePackage: z.null(),

    // the owner's approval of each open MCP proposal of one change, which takes a passkey on the page
    approveMcp: z.object({ change: z.enum(['server', 'tool']) }),

    // the owner's approval of each open mandate proposal, which takes a passkey on the page
    approveMandate: z.null(),

    // a mail that arrives at the assistant's own mailbox, on the in-memory host of a test build
    deliverMail: z.object({
      from: z.string(),
      subject: z.string(),
      text: z.string(),
      html: z.string().exactOptional(),
      messageID: z.string().exactOptional(),
      references: z.array(z.string()).exactOptional(),
    }),

    // a text that arrives at the assistant's own number, on the in-memory phone of a test build
    deliverText: z.object({ from: z.string(), body: z.string() }),

    connectCredential: credentialProviderSchema,
    refreshCredential: credentialProviderSchema,
    readCredentialStatus: credentialProviderSchema,
    readCredentialToken: credentialProviderSchema,
    readCredentialKeys: z.null(),
    readCredentialMarks: z.null(),
    hasCredentialKey: z.object({ keyID: z.string() }),
    forgetCredential: credentialProviderSchema,
  };
}

type NixieOperationSchemas = ReturnType<typeof buildNixieOperationSchemas>;

export type NixieOperationArgs = {
  readonly [Name in keyof NixieOperationSchemas]: z.input<NixieOperationSchemas[Name]>;
};
