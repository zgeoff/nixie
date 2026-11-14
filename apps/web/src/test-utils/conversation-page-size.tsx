import type { ReactNode } from 'react';
import { useConversationPage } from '../conversation/use-conversation-page';

export interface ConversationPageSizeProps {
  readonly label: string;
}

export function ConversationPageSize(props: ConversationPageSizeProps): ReactNode {
  const page = useConversationPage('conversation');

  return <p>{`${props.label}: ${page.data?.records.length ?? 0} records`}</p>;
}
