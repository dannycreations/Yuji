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
    (thread.title === 'New Chat' || thread.title.endsWith('...')) &&
    Object.keys(thread.messages).length === 0 &&
    message.role === 'user' &&
    message.content
  ) {
    return truncate(message.content.split('\n')[0], 40);
  }
  return thread.title;
};

export const sortThreadsByDate = <T extends ThreadMetadata | Thread>(threads: T[]): T[] => {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const filterThreads = <T extends ThreadMetadata | Thread>(threads: T[], query: string): T[] => {
  if (!query) return threads;
  const normalizedQuery = query.toLowerCase();
  return threads.filter((s) => s.title.toLowerCase().includes(normalizedQuery));
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

export const groupThreads = (
  threadsList: ReadonlyArray<ThreadMetadata | Thread>,
  pinnedThreadIds: ReadonlyArray<string> = [],
): Record<string, ReadonlyArray<ThreadMetadata | Thread>> => {
  const now = Date.now();
  const dayMs = 86400000; // 24 * 60 * 60 * 1000

  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - dayMs;
  const last7DaysStart = todayStart - 604800000; // 7 * dayMs

  const pinned: Array<ThreadMetadata | Thread> = [];
  const today: Array<ThreadMetadata | Thread> = [];
  const yesterday: Array<ThreadMetadata | Thread> = [];
  const last7Days: Array<ThreadMetadata | Thread> = [];
  const last30Days: Array<ThreadMetadata | Thread> = [];

  const pinnedSet = new Set(pinnedThreadIds);

  for (let i = 0; i < threadsList.length; i++) {
    const thread = threadsList[i];
    if (pinnedSet.has(thread.id)) {
      pinned.push(thread);
      continue;
    }

    const time = thread.updatedAt;
    if (time >= todayStart) {
      today.push(thread);
    } else if (time >= yesterdayStart) {
      yesterday.push(thread);
    } else if (time >= last7DaysStart) {
      last7Days.push(thread);
    } else {
      last30Days.push(thread);
    }
  }

  return {
    Pinned: pinned,
    Today: today,
    Yesterday: yesterday,
    'Last 7 Days': last7Days,
    'Last 30 Days': last30Days,
  };
};
