import { DEFAULT_SYSTEM_PROMPT, MODE_LIST } from '@yuji/client/app/Constant';
import { GlobalSetting, Model, Thread, ThreadMessage, ThreadMetadata } from '@yuji/client/app/Schema';
import { getModelId } from '@yuji/client/helpers/ModelHelper';
import { randomId, truncate } from '@yuji/client/utilities/CommonUtil';

export const ensureValidMode = (mode: string | undefined | null): 'chat' | 'agent' => {
  const isValid = MODE_LIST.some((m) => m.id === mode);
  return isValid ? (mode as 'chat' | 'agent') : 'chat';
};

export const createInitialThread = (settings: GlobalSetting, availableModels: readonly Model[]): Thread => {
  const now = Date.now();
  const { personalisation } = settings;

  return {
    id: randomId(),
    title: 'New Chat',
    mode: ensureValidMode(settings.mode),
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
  if (message.role !== 'user') {
    return thread.title;
  }

  const content = message.content.trim();
  if (!content) {
    return thread.title;
  }

  const isInitialState = thread.title === 'New Chat' || thread.title.endsWith('...');
  if (!isInitialState) {
    return thread.title;
  }

  const msgCount = Object.keys(thread.messages).length;
  // If no messages or only this message exists (during addMessage flow), generate title
  const isEligibleForAutoTitle = msgCount === 0 || (msgCount === 1 && thread.messages[message.id]);
  if (!isEligibleForAutoTitle) {
    return thread.title;
  }

  // Remove potential markdown headers/styling from the start of the first line
  const lines = content.split('\n', 1);
  const cleanLine = lines[0]
    .replace(/^#+\s+/, '') // Remove h1-h6 prefixes
    .replace(/^>\s+/, '') // Remove blockquote prefix
    .replace(/^-\s+|^(\d+\.)\s+/, '') // Remove list prefixes
    .replace(/[*_`]/g, '') // Remove basic markdown emphasis characters
    .trim();

  return truncate(cleanLine || content, 40);
};

export const sortThreadsByDate = <T extends ThreadMetadata | Thread>(threads: T[]): T[] => {
  if (threads.length <= 1) return threads;
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getMessagePath = (thread: Thread, messageId: string): ReadonlyArray<ThreadMessage> => {
  const path: ThreadMessage[] = [];
  let currentId: string | undefined = messageId;

  while (currentId) {
    const msg: ThreadMessage | undefined = thread.messages[currentId];
    if (!msg) {
      break;
    }

    path.push(msg);
    currentId = msg.parentId;
  }

  return path.reverse();
};

export const getBlockVersions = (thread: Thread, messageId: string): string[] => {
  const { messages } = thread;
  const msg = messages[messageId];
  if (!msg) {
    return [];
  }

  const byTimestampAsc = (a: string, b: string) => (messages[a]?.timestamp || 0) - (messages[b]?.timestamp || 0);

  if (!msg.parentId) {
    const roots = Object.values(messages).filter((m) => !m.parentId && m.role === msg.role);
    return roots.length <= 1 ? [messageId] : roots.map((m) => m.id).sort(byTimestampAsc);
  }

  const parent = messages[msg.parentId];
  if (!parent) {
    return [messageId];
  }

  const siblings = parent.childrenIds || [];
  return siblings.filter((sid) => messages[sid]?.role === msg.role).sort(byTimestampAsc);
};

export const findVersionLeaf = (thread: Thread, versionId: string): string => {
  const versionMsg = thread.messages[versionId];
  if (!versionMsg) {
    return versionId;
  }

  const roleToAvoid = versionMsg.role;
  let currentId = versionId;
  let isFirstStep = true;

  while (true) {
    const msg = thread.messages[currentId];
    const children = msg?.childrenIds;
    if (!children) {
      break;
    }

    if (children.length === 0) {
      break;
    }

    let bestChildId: string | undefined;
    let maxTimestamp = -1;

    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      const child = thread.messages[childId];
      if (!child) {
        continue;
      }

      if (isFirstStep && child.role === roleToAvoid) {
        continue;
      }

      if (child.timestamp > maxTimestamp) {
        maxTimestamp = child.timestamp;
        bestChildId = childId;
      }
    }

    if (!bestChildId) {
      break;
    }
    currentId = bestChildId;
    isFirstStep = false;
  }

  return currentId;
};

export const getVisibleMessages = (thread: Thread): ReadonlyArray<ThreadMessage> => {
  const { activeMessageId, messages } = thread;

  if (activeMessageId) {
    return getMessagePath(thread, activeMessageId);
  }

  return Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
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

  // Single pass to clone messages and map IDs
  for (let i = 0; i < path.length; i++) {
    const m = path[i];
    const newMsgId = randomId();
    idMap.set(m.id, newMsgId);

    const newParentId = m.parentId ? idMap.get(m.parentId) : undefined;
    const branchedMsg: ThreadMessage = {
      ...m,
      id: newMsgId,
      parentId: newParentId,
      childrenIds: [],
    };

    branchedMessages[newMsgId] = branchedMsg;

    if (newParentId) {
      const parent = branchedMessages[newParentId];
      if (parent) {
        const next = parent.childrenIds ? [...parent.childrenIds, newMsgId] : [newMsgId];
        branchedMessages[newParentId] = { ...parent, childrenIds: next };
      }
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

export const getFlattenedThreads = (
  threadsList: ReadonlyArray<ThreadMetadata | Thread>,
  searchQuery: string,
  pinnedThreadIds: ReadonlyArray<string> = [],
): FlattenedThreadItem[] => {
  const query = searchQuery.trim().toLowerCase();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const last7DaysStart = todayStart - 518400000;
  const pinnedSet = pinnedThreadIds.length > 0 ? new Set(pinnedThreadIds) : null;

  const labels = ['Pinned', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];
  const groups = labels.reduce(
    (acc, label) => {
      acc[label] = [];
      return acc;
    },
    {} as Record<string, (ThreadMetadata | Thread)[]>,
  );

  for (const thread of threadsList) {
    if (thread.archived) {
      continue;
    }

    const matchesQuery = !query || thread.title.toLowerCase().includes(query);
    if (!matchesQuery) {
      continue;
    }

    if (pinnedSet?.has(thread.id)) {
      groups['Pinned'].push(thread);
      continue;
    }

    const ts = thread.updatedAt;

    if (ts >= todayStart) {
      groups['Today'].push(thread);
      continue;
    }

    if (ts >= yesterdayStart) {
      groups['Yesterday'].push(thread);
      continue;
    }

    if (ts >= last7DaysStart) {
      groups['Last 7 Days'].push(thread);
      continue;
    }

    groups['Last 30 Days'].push(thread);
  }

  const result: FlattenedThreadItem[] = [];

  for (const label of labels) {
    const group = groups[label];
    if (group.length === 0) {
      continue;
    }

    result.push({ type: 'label', label });

    for (const thread of group) {
      result.push({ type: 'thread', thread });
    }
  }
  return result;
};
