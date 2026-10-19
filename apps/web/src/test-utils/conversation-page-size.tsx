import type { ReactNode } from 'react';
import { useConversationPage } from '../use-conversation-page';

export interface ConversationPageSizeProps {
  readonly label: string;
}

// Shows how many records the conversation's page holds, with no live stream to add to them, so a
// test reads which page a view kept.
export function ConversationPageSize(props: ConversationPageSizeProps): ReactNode {
  const page = useConversationPage('conversation');

  return <p>{`${props.label}: ${page.data?.records.length ?? 0} records`}</p>;
}
