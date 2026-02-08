import type { ChatMessage, ChatMetadata, ChatThread } from '../app/Schema';

export const sortThreadsByDate = <T extends ChatMetadata | ChatThread>(threads: T[]): T[] => {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const filterThreads = <T extends ChatMetadata | ChatThread>(threads: T[], query: string): T[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return threads;
  return threads.filter((s) => s.title.toLowerCase().includes(normalizedQuery));
};

export const getMessagePath = (thread: ChatThread, messageId: string): ReadonlyArray<ChatMessage> => {
  const path: ChatMessage[] = [];
  let currentId: string | undefined = messageId;

  while (currentId) {
    const msg: ChatMessage | undefined = thread.messages[currentId];
    if (!msg) break;
    path.unshift(msg);
    currentId = msg.parentId;
  }

  return path;
};

export const groupThreads = (
  threadsList: ReadonlyArray<ChatMetadata | ChatThread>,
  pinnedThreadIds: ReadonlyArray<string> = [],
): Record<string, ReadonlyArray<ChatMetadata | ChatThread>> => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - dayMs;
  const last7DaysStart = todayStart - 7 * dayMs;

  const groups: Record<string, Array<ChatMetadata | ChatThread>> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
  };

  threadsList.forEach((thread) => {
    if (pinnedThreadIds.includes(thread.id)) {
      groups['Pinned'].push(thread);
      return;
    }

    const time = thread.updatedAt;
    if (time >= todayStart) {
      groups['Today'].push(thread);
    } else if (time >= yesterdayStart) {
      groups['Yesterday'].push(thread);
    } else if (time >= last7DaysStart) {
      groups['Last 7 Days'].push(thread);
    } else {
      groups['Last 30 Days'].push(thread);
    }
  });

  return groups;
};
