import { z } from 'zod';

// The bundler keeps a schema built at module level, so a release bundle would hold these names.
export function buildNixieOperationSchemas() {
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

    // a mail that arrives at the assistant's own mailbox, on the in-memory host of a test build
    deliverMail: z.object({
      from: z.string(),
      subject: z.string(),
      text: z.string(),
      html: z.string().exactOptional(),
      messageID: z.string().exactOptional(),
      references: z.array(z.string()).exactOptional(),
    }),

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
