import { DEFAULT_SYSTEM_PROMPT } from '../app/Constant';
import { GlobalSetting, Model, Thread, ThreadMessage, ThreadMetadata } from '../app/Schema';
import { randomId, truncate } from '../utilities/CommonUtil';
import { getModelId } from './ModelHelper';

export const createInitialThread = (settings: GlobalSetting, availableModels: readonly Model[]): Thread => {
  const now = Date.now();
  const { personalisation } = settings;

  return {
    id: randomId(),
    title: 'New Chat',
    messages: {},
    createdAt: now,
    updatedAt: now,
    general: {
      model: getModelId(settings, availableModels),
      overrideInstruction: false,
      overridePersonalisation: false,
    },
    instruction: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
    personalisation: {
      ...personalisation,
      userOccupation: [...personalisation.userOccupation],
      assistantTraits: [...personalisation.assistantTraits],
    },
  };
};

export const generateThreadTitle = (thread: Thread, message: ThreadMessage): string => {
  if (
    message.role === 'user' &&
    message.content &&
    (thread.title === 'New Chat' || thread.title.endsWith('...')) &&
    !Object.keys(thread.messages).some((id) => id !== message.id)
  ) {
    const firstLine = message.content.split('\n', 1)[0];
    return truncate(firstLine, 40);
  }
  return thread.title;
};

export const sortThreadsByDate = <T extends ThreadMetadata | Thread>(threads: T[]): T[] => {
  return threads.length <= 1 ? threads : [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const filterThreads = <T extends ThreadMetadata | Thread>(threads: T[], query: string): T[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return threads;
  return threads.filter((s) => s.title.toLowerCase().includes(normalized));
};

export const getMessagePath = (thread: Thread, messageId: string): ReadonlyArray<ThreadMessage> => {
  const path: ThreadMessage[] = [];
  let currentId: string | undefined = messageId;

  while (currentId) {
    const msg: ThreadMessage | undefined = thread.messages[currentId];
    if (!msg) break;
    path.push(msg);
    currentId = msg.parentId;
  }

  return path.reverse();
};

export const getVisibleMessages = (thread: Thread): ReadonlyArray<ThreadMessage> => {
  const { activeMessageId, messages } = thread;
  if (activeMessageId) {
    return getMessagePath(thread, activeMessageId);
  }
  const vals = Object.values(messages);
  if (vals.length <= 1) return vals;
  return vals.sort((a, b) => a.timestamp - b.timestamp);
};

export const branchThreadPath = (
  sourceThread: Thread,
  messageId: string,
): {
  branchedMessages: Record<string, ThreadMessage>;
  newActiveMessageId: string;
} => {
  const path = getMessagePath(sourceThread, messageId);
  const branchedMessages: Record<string, ThreadMessage> = {};
  const idMap = new Map<string, string>();
  const messagesToSave: ThreadMessage[] = [];

  for (const m of path) {
    const newMsgId = randomId();
    idMap.set(m.id, newMsgId);

    const branchedMsg: ThreadMessage = {
      ...m,
      id: newMsgId,
      parentId: m.parentId ? idMap.get(m.parentId) : undefined,
      childrenIds: [],
    };

    branchedMessages[newMsgId] = branchedMsg;
    messagesToSave.push(branchedMsg);
  }

  for (const m of messagesToSave) {
    if (m.parentId && branchedMessages[m.parentId]) {
      const parent = branchedMessages[m.parentId];
      branchedMessages[m.parentId] = {
        ...parent,
        childrenIds: [...(parent.childrenIds || []), m.id],
      };
    }
  }

  return {
    branchedMessages,
    newActiveMessageId: idMap.get(messageId) || '',
  };
};

export type FlattenedThreadItem =
  | {
      readonly type: 'label';
      readonly label: string;
    }
  | {
      readonly type: 'thread';
      readonly thread: ThreadMetadata | Thread;
    };

const GROUP_LABELS = ['Pinned', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'] as const;

export const getFlattenedThreads = (
  threadsList: ReadonlyArray<ThreadMetadata | Thread>,
  searchQuery: string,
  pinnedThreadIds: ReadonlyArray<string> = [],
): FlattenedThreadItem[] => {
  const query = searchQuery.trim().toLowerCase();
  const now = Date.now();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const last7DaysStart = todayStart - 518400000; // 6 * 86400000
  const pinnedSet = pinnedThreadIds.length > 0 ? new Set(pinnedThreadIds) : null;

  const groups: Record<(typeof GROUP_LABELS)[number], Array<ThreadMetadata | Thread>> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 Days': [],
    'Last 30 Days': [],
  };

  for (let i = 0, len = threadsList.length; i < len; i++) {
    const thread = threadsList[i];
    if (thread.archived) continue;
    if (query && !thread.title.toLowerCase().includes(query)) continue;

    if (pinnedSet?.has(thread.id)) {
      groups.Pinned.push(thread);
    } else {
      const ts = thread.updatedAt;
      if (ts >= todayStart) {
        groups.Today.push(thread);
      } else if (ts >= yesterdayStart) {
        groups.Yesterday.push(thread);
      } else if (ts >= last7DaysStart) {
        groups['Last 7 Days'].push(thread);
      } else {
        groups['Last 30 Days'].push(thread);
      }
    }
  }

  const result: FlattenedThreadItem[] = [];
  for (let i = 0, len = GROUP_LABELS.length; i < len; i++) {
    const label = GROUP_LABELS[i];
    const group = groups[label];
    const gLen = group.length;
    if (gLen > 0) {
      result.push({ type: 'label', label });
      for (let j = 0; j < gLen; j++) {
        result.push({ type: 'thread', thread: group[j] });
      }
    }
  }
  return result;
};
