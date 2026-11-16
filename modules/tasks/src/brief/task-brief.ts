// A message brief is a task_message record, a created brief sits in the task.created record of a
// task the release before started, and a definition brief has no record. body is null once a
// forget removes it.
export type TaskBrief =
  | {
      readonly origin: 'message';
      readonly messageID: string;
      readonly from: string;
      readonly sequence: number;
      readonly sentAt: Date;
      readonly body: string | null;
    }
  | {
      readonly origin: 'created';
      readonly taskID: string;
      readonly from: string;
      readonly sequence: number;
      readonly sentAt: Date;
      readonly body: string | null;
    }
  | {
      readonly origin: 'definition';
      readonly briefID: string;
      readonly sequence: number;
      readonly sentAt: Date;
      readonly body: string;
    };
