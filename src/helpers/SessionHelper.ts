import type { ChatSession, Message } from '../app/Schema';

export const getMessagePath = (session: ChatSession, messageId: string): ReadonlyArray<Message> => {
  const findPath = (currId: string): ReadonlyArray<Message> => {
    const msg = session.messages.find((m) => m.id === currId);
    if (!msg) return [];
    return msg.parentId ? [...findPath(msg.parentId), msg] : [msg];
  };

  return findPath(messageId);
};

export const groupSessions = (sessionsList: ChatSession[]) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, ChatSession[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
  };

  sessionsList.forEach((session) => {
    const date = new Date(session.updatedAt);
    if (date.toDateString() === today.toDateString()) {
      groups['Today'].push(session);
    } else if (date.toDateString() === yesterday.toDateString()) {
      groups['Yesterday'].push(session);
    } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
      groups['Last 7 Days'].push(session);
    } else {
      groups['Last 30 Days'].push(session);
    }
  });

  return groups;
};
