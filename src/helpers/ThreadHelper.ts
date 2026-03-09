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
  if (message.role !== 'user' || !message.content) return thread.title;

  const isInitialState = thread.title === 'New Chat' || thread.title.endsWith('...');
  if (!isInitialState) return thread.title;

  const msgCount = Object.keys(thread.messages).length;
  // If no messages or only this message exists (during addMessage flow), generate title
  if (msgCount === 0 || (msgCount === 1 && thread.messages[message.id])) {
    const firstLine = message.content.split('\n', 1)[0];
    return truncate(firstLine, 40);
  }

  return thread.title;
};

export const sortThreadsByDate = <T extends ThreadMetadata | Thread>(threads: T[]): T[] => {
  if (threads.length <= 1) return threads;
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
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

export const getEffectiveMessages = (path: ReadonlyArray<ThreadMessage>): ThreadMessage[] => {
  const result: ThreadMessage[] = [];
  for (let i = 0; i < path.length; i++) {
    const msg = path[i];
    if (i === path.length - 1 || path[i + 1].role !== msg.role) {
      result.push(msg);
    }
  }
  return result;
};

export const getBlockVersions = (thread: Thread, messageId: string): string[] => {
  const msg = thread.messages[messageId];
  if (!msg) return [];

  const parentId = msg.parentId;
  if (!parentId) return [messageId];

  const parent = thread.messages[parentId];
  if (!parent) return [messageId];

  const siblings = parent.childrenIds || [];
  if (siblings.length <= 1) return [messageId];

  // Just return children of the parent that share the same role
  // This avoids deep tree traversal since the UI only shows siblings in the same branch point
  const versions: string[] = [];
  for (let i = 0, len = siblings.length; i < len; i++) {
    const sid = siblings[i];
    const smsg = thread.messages[sid];
    if (smsg?.role === msg.role) {
      versions.push(sid);
    }
  }

  return versions.sort((a, b) => (thread.messages[a]?.timestamp || 0) - (thread.messages[b]?.timestamp || 0));
};

export const findVersionLeaf = (thread: Thread, versionId: string): string => {
  const versionMsg = thread.messages[versionId];
  if (!versionMsg) return versionId;

  const roleToAvoid = versionMsg.role;
  let currentId = versionId;
  let isFirstStep = true;

  while (true) {
    const msg = thread.messages[currentId];
    const children = msg?.childrenIds;
    if (!children || children.length === 0) break;

    let bestChildId: string | undefined;
    let maxTimestamp = -1;

    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      const child = thread.messages[childId];
      if (!child) continue;
      if (isFirstStep && child.role === roleToAvoid) continue;

      if (child.timestamp > maxTimestamp) {
        maxTimestamp = child.timestamp;
        bestChildId = childId;
      }
    }

    if (!bestChildId) break;
    currentId = bestChildId;
    isFirstStep = false;
  }

  return currentId;
};

export const getVisibleMessages = (thread: Thread): ReadonlyArray<ThreadMessage> => {
  const { activeMessageId, messages } = thread;
  if (activeMessageId) {
    const path = getMessagePath(thread, activeMessageId);
    return getEffectiveMessages(path);
  }
  const vals = Object.values(messages);
  return getEffectiveMessages(vals.length <= 1 ? vals : vals.sort((a, b) => a.timestamp - b.timestamp));
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

  for (let i = 0; i < threadsList.length; i++) {
    const thread = threadsList[i];
    if (thread.archived) continue;

    if (query && !thread.title.toLowerCase().includes(query)) continue;

    if (pinnedSet?.has(thread.id)) {
      groups.Pinned.push(thread);
      continue;
    }

    const ts = thread.updatedAt;
    if (ts >= todayStart) groups.Today.push(thread);
    else if (ts >= yesterdayStart) groups.Yesterday.push(thread);
    else if (ts >= last7DaysStart) groups['Last 7 Days'].push(thread);
    else groups['Last 30 Days'].push(thread);
  }

  const result: FlattenedThreadItem[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const group = groups[label];
    if (group.length > 0) {
      result.push({ type: 'label', label });
      for (let j = 0; j < group.length; j++) {
        result.push({ type: 'thread', thread: group[j] });
      }
    }
  }
  return result;
};
