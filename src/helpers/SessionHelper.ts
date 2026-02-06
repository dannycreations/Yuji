import type { ChatMessage, ChatMetadata, ChatSession } from '../app/Schema';

export const getMessagePath = (session: ChatSession, messageId: string): ReadonlyArray<ChatMessage> => {
  const path: ChatMessage[] = [];
  let currentId: string | undefined = messageId;

  while (currentId) {
    const msg: ChatMessage | undefined = session.messages[currentId];
    if (!msg) break;
    path.unshift(msg);
    currentId = msg.parentId;
  }

  return path;
};

export const groupSessions = (
  sessionsList: ReadonlyArray<ChatMetadata | ChatSession>,
  pinnedSessionIds: ReadonlyArray<string> = [],
): Record<string, ReadonlyArray<ChatMetadata | ChatSession>> => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - dayMs;
  const last7DaysStart = todayStart - 7 * dayMs;

  const groups: Record<string, Array<ChatMetadata | ChatSession>> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
  };

  sessionsList.forEach((session) => {
    if (pinnedSessionIds.includes(session.id)) {
      groups['Pinned'].push(session);
      return;
    }

    const time = session.updatedAt;
    if (time >= todayStart) {
      groups['Today'].push(session);
    } else if (time >= yesterdayStart) {
      groups['Yesterday'].push(session);
    } else if (time >= last7DaysStart) {
      groups['Last 7 Days'].push(session);
    } else {
      groups['Last 30 Days'].push(session);
    }
  });

  return groups;
};
