export interface MemoryIndexConfig {
  readonly tokens: number;
  readonly openTopicItems: number;
  readonly itemOrder: 'newest-first';
  readonly topicPage: number;
}

export const defaultIndexSettings: MemoryIndexConfig = {
  tokens: 3000,
  openTopicItems: 25,
  itemOrder: 'newest-first',
  topicPage: 200,
};
