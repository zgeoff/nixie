// TypeScript's DOM types leave out the notification options that Chrome supports and the probe
// tests: action buttons and renotify.
export interface ProbeNotificationOptions extends NotificationOptions {
  actions?: { action: string; title: string }[];
  renotify?: boolean;
}

export type ShowNotification = (title: string, options: ProbeNotificationOptions) => Promise<void>;
