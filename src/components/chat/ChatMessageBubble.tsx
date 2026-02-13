import clsx from 'clsx';
import { Effect } from 'effect';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useCopy } from '../../hooks/useCopy';
import { useStore, useStoreAction, useStoreEffect } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { Dropdown, DropdownItem } from '../shared/Dropdown';
import { Icon } from '../shared/Icon';
import { InputButton, InputTextarea } from '../shared/InputArea';
import { ChatMessageBlock } from './ChatMessageBlock';

import type { FC } from 'react';
import type { Components } from 'react-markdown';
import type { ConfirmOptions, ThreadMessage } from '../../app/Schema';

const Markdown = memo(
  ({ content, components }: { content: string; components: Components }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
      {content}
    </ReactMarkdown>
  ),
  (prev, next) => prev.content === next.content && prev.components === next.components,
);

interface ChatMessageBubbleProps {
  readonly message: ThreadMessage;
  readonly threadId: string;
  readonly isThinking?: boolean;
  readonly onUpdateHeight?: () => void;
  readonly readOnly?: boolean;
}

export const ChatMessageBubble: FC<ChatMessageBubbleProps> = memo(({ message, threadId, isThinking, onUpdateHeight, readOnly }) => {
  const isUser = message.role === 'user';
  const saveAfterEditing = useStore((s) => s.settings.saveAfterEditing);
  const childrenIds = useStore(
    (s) => {
      if (!message.parentId) return undefined;
      const thread = s.activeThread;
      if (!thread || thread.id !== threadId) return undefined;
      return thread.messages[message.parentId!]?.childrenIds;
    },
    // Deep equality for childrenIds to prevent re-renders when children array contents are identical
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );

  const [copied, setCopy] = useCopy();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const [isRegenerateDropdownOpen, setIsRegenerateDropdownOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const regenerateTriggerRef = useRef<HTMLButtonElement>(null);

  const handleBranch = useStoreEffect((tid: string, mid: string) => Effect.flatMap(ChatService, (chat) => chat.branchChat(tid, mid)));
  const handleSwitchBranch = useStoreEffect((_tid: string, mid: string) =>
    Effect.flatMap(ChatService, (chat) => chat.updateActiveThread((t) => ({ ...t, activeMessageId: mid }))),
  );
  const handleDeleteMessage = useStoreEffect((tid: string, mid: string) => Effect.flatMap(ChatService, (chat) => chat.deleteMessage(tid, mid)));
  const handleRegenerate = useStoreEffect((tid: string, mid: string, options?: { instruction?: string }) =>
    Effect.flatMap(ChatService, (chat) => chat.regenerateMessage(tid, mid, options)),
  );
  const handleEdit = useStoreEffect((tid: string, mid: string, content: string) =>
    Effect.flatMap(ChatService, (chat) => chat.updateMessage(tid, mid, content)),
  );

  // Logic to find siblings for navigation
  const siblings = childrenIds || [];
  const currentIndex = siblings.indexOf(message.id);

  const handleSwitch = useCallback(
    (newId: string) => {
      handleSwitchBranch(threadId, newId);
    },
    [handleSwitchBranch, threadId],
  );

  const handleCopy = useCallback(() => setCopy(message.content), [message.content, setCopy]);

  const handleSaveEdit = useCallback(() => {
    if (editContent.trim() !== message.content.trim()) {
      handleEdit(threadId, message.id, editContent);
      onUpdateHeight?.();
    }

    if (!saveAfterEditing) {
      handleRegenerate(threadId, message.id);
    }

    setIsEditing(false);
  }, [editContent, message.content, message.role, threadId, message.id, handleEdit, handleRegenerate, saveAfterEditing, onUpdateHeight]);

  const onConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const handleDelete = () =>
    onConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmLabel: 'Delete',
      onConfirm: () => handleDeleteMessage(threadId, message.id),
    });

  const markdownComponents = useMemo<Components>(
    () => ({
      code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';
        const rawContent = String(children);
        const value = rawContent.replace(/\n$/, '');
        const isMultiline = value.includes('\n');

        if (match || isMultiline || rawContent.endsWith('\n')) {
          return <ChatMessageBlock language={language} value={value} />;
        }

        return (
          <code className={clsx('code-inline', className)} {...props}>
            {children}
          </code>
        );
      },
      a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
      ul: ({ node, ...props }) => <ul {...props} />,
      ol: ({ node, ...props }) => <ol {...props} />,
      h1: ({ node, ...props }) => <h1 {...props} />,
      h2: ({ node, ...props }) => <h2 {...props} />,
      h3: ({ node, ...props }) => <h3 {...props} />,
      blockquote: ({ node, ...props }) => <blockquote {...props} />,
      table: ({ node, ...props }) => (
        <div className="prose-table">
          <table {...props} />
        </div>
      ),
      th: ({ node, ...props }) => <th {...props} />,
      td: ({ node, ...props }) => <td {...props} />,
      p: ({ node, ...props }) => <div className="prose-p" {...props} />,
    }),
    [],
  );

  return (
    <div className="group w-full" data-message-id={message.id}>
      <div className={clsx('message-row', isUser ? 'user' : 'assistant')}>
        <div className={clsx('message-container', isUser ? 'user' : 'assistant', readOnly && 'no-actions')}>
          <div className={clsx('message-content-wrapper', isUser ? 'user' : 'assistant')}>
            <AttachmentGrid attachments={message.attachments || []} className="message-attachment-grid mb-2" />

            {isEditing ? (
              <div className="chat-input-edit-container">
                <InputTextarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="chat-input-textarea"
                  minRows={2}
                  debounceMs={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      setIsEditing(false);
                    }
                  }}
                  autoFocus
                />
                <div className="chat-input-edit-actions">
                  <InputButton variant="secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </InputButton>
                  <InputButton variant="primary" onClick={handleSaveEdit}>
                    {saveAfterEditing ? 'Save' : 'Regenerate'}
                  </InputButton>
                </div>
              </div>
            ) : (
              <div className={clsx(isUser ? 'message-bubble-user' : 'message-bubble-assistant')}>
                {isThinking && !message.content ? (
                  <div className="message-thinking-container">
                    <div className="message-thinking-dot" />
                    <div className="message-thinking-dot message-thinking-dot-delay-1" />
                    <div className="message-thinking-dot message-thinking-dot-delay-2" />
                  </div>
                ) : (
                  <Markdown content={message.content} components={markdownComponents} />
                )}
              </div>
            )}
          </div>

          {!isEditing && !readOnly && (
            <div className={clsx('message-action-bar', isThinking && 'opacity-0 pointer-events-none')}>
              <div className="message-actions">
                {siblings.length > 1 && (
                  <div className="message-branch-navigation">
                    <InputButton disabled={currentIndex === 0} onClick={() => handleSwitch(siblings[currentIndex - 1])} title="Previous Version">
                      <Icon name="ChevronLeft" size={16} />
                    </InputButton>
                    <span className="message-branch-indicator">
                      {currentIndex + 1}
                      <span className="message-branch-indicator-slash">/</span>
                      {siblings.length}
                    </span>
                    <InputButton
                      disabled={currentIndex === siblings.length - 1}
                      onClick={() => handleSwitch(siblings[currentIndex + 1])}
                      title="Next Version"
                    >
                      <Icon name="ChevronRight" size={16} />
                    </InputButton>
                  </div>
                )}

                <InputButton onClick={() => handleBranch(threadId, message.id)} title="Branch">
                  <Icon name="GitFork" size={16} />
                </InputButton>

                <div className="relative">
                  <InputButton ref={regenerateTriggerRef} onClick={() => setIsRegenerateDropdownOpen(true)} title="Regenerate">
                    <Icon name="RefreshCw" size={16} />
                  </InputButton>

                  <Dropdown
                    isOpen={isRegenerateDropdownOpen}
                    onClose={() => {
                      setIsRegenerateDropdownOpen(false);
                      setCustomInstruction('');
                    }}
                    triggerRef={regenerateTriggerRef}
                    className="w-55 p-0"
                  >
                    <div className="p-2 border-b border-separator/50">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          className="input-base input-sm pr-9"
                          placeholder="Ask to change response"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customInstruction.trim()) {
                              handleRegenerate(threadId, message.id, { instruction: customInstruction.trim() });
                              setIsRegenerateDropdownOpen(false);
                              setCustomInstruction('');
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className={clsx(
                            'absolute right-1.5 p-1 rounded-md transition-all',
                            customInstruction.trim() ? 'bg-primary text-background' : 'text-text-tertiary opacity-50',
                          )}
                          onClick={() => {
                            if (customInstruction.trim()) {
                              handleRegenerate(threadId, message.id, { instruction: customInstruction.trim() });
                              setIsRegenerateDropdownOpen(false);
                              setCustomInstruction('');
                            }
                          }}
                        >
                          <Icon name="ArrowUp" size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="py-1">
                      <DropdownItem
                        icon="RefreshCw"
                        label="Try again"
                        onClick={() => {
                          handleRegenerate(threadId, message.id);
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon="ArrowUpDown"
                        label="Add details"
                        onClick={() => {
                          handleRegenerate(threadId, message.id, {
                            instruction: 'Add more details and be more comprehensive.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon="Minimize2"
                        label="More concise"
                        onClick={() => {
                          handleRegenerate(threadId, message.id, {
                            instruction: 'Make the response more concise and brief.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon="Lightbulb"
                        label="Think longer"
                        onClick={() => {
                          handleRegenerate(threadId, message.id, {
                            instruction: 'Think longer and provide a more deeply reasoned response.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                    </div>
                  </Dropdown>
                </div>

                <InputButton onClick={handleCopy} title="Copy">
                  <Icon name={copied ? 'Check' : 'Copy'} size={16} />
                </InputButton>

                <InputButton
                  onClick={() => {
                    setEditContent(message.content);
                    setIsEditing(true);
                  }}
                  title="Edit"
                >
                  <Icon name="Pencil" size={16} />
                </InputButton>

                <InputButton
                  onClick={handleDelete}
                  variant="danger"
                  className="bg-transparent! text-text-secondary! hover:text-danger!"
                  title="Delete"
                >
                  <Icon name="Trash2" size={16} />
                </InputButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
