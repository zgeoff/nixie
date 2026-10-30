// The probe API that the server implements and the pages and the service worker call. It imports
// only @orpc/contract and zod, so the browser bundles stay small.
import { oc } from '@orpc/contract';
import { z } from 'zod';

// nixie's API refuses a call without this header, so the probe's API does too.
export const clientHeaderName = 'x-nixie-client';
export const adminHeaderName = 'x-probe-admin';
export const rpcPrefix = '/rpc';
export const outboxSyncTag = 'probe-outbox';
export const receiptSyncTag = 'probe-receipts';
export const messageMaxLength = 2000;

export const logEntrySchema = z.object({
  id: z.uuid(),
  at: z.string(),
  // the session's public label, never its cookie value
  session: z.string().nullable(),
  kind: z.enum(['subscribed', 'push-sent', 'push-received', 'approve', 'share', 'sync']),
  detail: z.record(z.string(), z.unknown()),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

export const pushInputSchema = z.object({
  title: z.string().max(120).default('nixie probe'),
  urgency: z.enum(['very-low', 'low', 'normal', 'high']).default('normal'),
  tag: z.string().max(64).default(''),
  silent: z.boolean().default(false),
  renotify: z.boolean().default(false),
  approve: z.boolean().default(false),
  delaySeconds: z.number().int().min(0).max(3600).default(0),
});

export const approvalSchema = z.object({ approvalID: z.uuid(), token: z.string().min(1).max(200) });

export type Approval = z.infer<typeof approvalSchema>;

// A browser's push subscription, as PushSubscription.toJSON() gives it.
export const subscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

// What the service worker receives in each push, encrypted for the subscription.
export const pushPayloadSchema = z.object({
  pushID: z.uuid(),
  sentAt: z.number(),
  title: z.string(),
  tag: z.string(),
  silent: z.boolean(),
  renotify: z.boolean(),
  urgency: z.string(),
  approval: approvalSchema.nullable(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const probeContract = {
  config: oc.output(z.object({ vapidPublicKey: z.string(), session: z.string().nullable() })),
  createPairing: oc.output(z.object({ code: z.string(), expiresAt: z.string() })),
  pair: oc
    .input(z.object({ code: z.string().min(1).max(64) }))
    .output(z.object({ session: z.string() })),
  subscribe: oc.input(subscriptionSchema).output(z.object({ subscribed: z.literal(true) })),
  push: oc.input(pushInputSchema).output(
    z.object({
      pushID: z.uuid(),
      delaySeconds: z.number(),
      // null while a delayed push waits
      statuses: z.array(z.number()).nullable(),
    }),
  ),
  pushReceived: oc
    .input(z.object({ pushID: z.uuid(), receivedAt: z.number() }))
    .output(z.object({ recorded: z.literal(true), duplicate: z.boolean() })),
  approve: oc.input(approvalSchema).output(z.object({ approved: z.literal(true) })),
  signOut: oc.output(z.object({ signedOut: z.boolean() })),
  sync: oc
    .input(
      z.object({
        messageID: z.uuid(),
        text: z.string().max(messageMaxLength),
        queuedAt: z.number(),
        lastChance: z.boolean(),
      }),
    )
    .output(z.object({ duplicate: z.boolean() })),
  log: oc.output(z.array(logEntrySchema)),
  entry: oc.input(z.object({ id: z.uuid() })).output(logEntrySchema),
  subscriptions: oc.output(
    z.array(z.object({ session: z.string().nullable(), pushService: z.string() })),
  ),
};
