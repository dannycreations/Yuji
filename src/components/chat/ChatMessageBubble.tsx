import clsx from 'clsx';
import {
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitFork,
  Globe,
  Lightbulb,
  Minimize2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { SEARCH_INSTRUCTION } from '../../app/Constant';
import { findVersionLeaf } from '../../helpers/ThreadHelper';
import { useAttachment } from '../../hooks/useAttachment';
import { useCopy } from '../../hooks/useCopy';
import { useSmoothTyping } from '../../hooks/useSmoothTyping';
import { useChatAction, useStore, useStoreAction } from '../../hooks/useStore';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { Dropdown, DropdownItem } from '../shared/Dropdown';
import { ButtonInput, TextareaInput } from '../shared/InputArea';
import { FilePicker } from '../shared/PickerArea';
import { ChatMessageBlock } from './ChatMessageBlock';

import type { FC } from 'react';
import type { Components } from 'react-markdown';
import type { Attachment, ConfirmOptions, ThreadMessage } from '../../app/Schema';

const Markdown = memo(
  ({ content, components }: { content: string; components: Components }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
      {content}
    </ReactMarkdown>
  ),
  (prev, next) => prev.content === next.content,
);

interface ChatMessageBubbleProps {
  readonly message: ThreadMessage;
  readonly threadId: string;
  readonly siblings?: readonly string[];
  readonly isThinking?: boolean;
  readonly readOnly?: boolean;
}

export const ChatMessageBubble: FC<ChatMessageBubbleProps> = memo(({ message, threadId, siblings, isThinking, readOnly }) => {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const saveAfterEditing = useStore((s) => s.settings.saveAfterEditing);

  const [copied, setCopy] = useCopy();
  const [isEditing, setIsEditing] = useState(false);
  const smoothedContent = useSmoothTyping(message.content, !!isThinking);
  const [editContent, setEditContent] = useState(message.content);
  const { attachments, setAttachments, onFileSelect, onPaste, removeAttachment } = useAttachment(message.attachments || []);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);

  const [isRegenerateDropdownOpen, setIsRegenerateDropdownOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const regenerateTriggerRef = useRef<HTMLButtonElement>(null);

  const onBranch = useChatAction((c, tid: string, mid: string) => c.branchChat(tid, mid));
  const onSwitch = useChatAction((c, _tid: string, mid: string) => c.updateActiveThread((t) => ({ ...t, activeMessageId: findVersionLeaf(t, mid) })));
  const onDeleteMessage = useChatAction((c, tid: string, mid: string) => c.deleteMessage(tid, mid));
  const onRegenerate = useChatAction((c, tid: string, mid: string, options?: { instruction?: string; search?: boolean }) =>
    c.regenerateMessage(tid, mid, options),
  );
  const onEditMessage = useChatAction(
    (c, tid: string, mid: string, content: string, options?: { attachments?: readonly Attachment[]; generateNext?: boolean; instruction?: string }) =>
      c.editMessage(tid, mid, content, options),
  );

  // Logic to find siblings for navigation
  const siblingsList = siblings || [];
  const currentIndex = siblingsList.indexOf(message.id);

  const handleSwitch = useCallback(
    (newId: string) => {
      onSwitch(threadId, newId);
    },
    [onSwitch, threadId],
  );

  const handleCopy = useCallback(() => setCopy(message.content), [message.content, setCopy]);

  const handleSaveEdit = useCallback(() => {
    const contentChanged = editContent.trim() !== message.content.trim();
    const currentAttachments = message.attachments || [];
    const attachmentsChanged =
      attachments.length !== currentAttachments.length ||
      attachments.some((a, i) => a.id !== currentAttachments[i]?.id || a.url !== currentAttachments[i]?.url);

    if (!contentChanged && !attachmentsChanged) {
      if (!saveAfterEditing) {
        onRegenerate(threadId, message.id, isSearchEnabled ? { instruction: SEARCH_INSTRUCTION } : undefined);
      }

      setIsEditing(false);
      setIsSearchEnabled(false);
      return;
    }

    onEditMessage(threadId, message.id, editContent, {
      attachments: [...attachments],
      generateNext: !saveAfterEditing,
      instruction: isSearchEnabled ? SEARCH_INSTRUCTION : undefined,
    });

    setIsEditing(false);
    setIsSearchEnabled(false);
  }, [
    editContent,
    attachments,
    isSearchEnabled,
    message.content,
    message.attachments,
    threadId,
    message.id,
    onEditMessage,
    onRegenerate,
    saveAfterEditing,
  ]);

  const onConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const handleDelete = () =>
    onConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmLabel: 'Delete',
      onConfirm: () => onDeleteMessage(threadId, message.id),
    });

  const markdownComponents = useMemo<Components>(
    () => ({
      code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const rawContent = String(children);
        const value = rawContent.replace(/\n$/, '');

        if (match || value.includes('\n') || rawContent.endsWith('\n')) {
          return <ChatMessageBlock language={match ? match[1] : ''} value={value} />;
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
      <div className={clsx('message-row', isUser ? 'user' : isTool ? 'tool' : 'assistant')}>
        <div className={clsx('message-container', isUser ? 'user' : isTool ? 'tool' : 'assistant', readOnly && 'no-actions')}>
          <div className={clsx('message-content-wrapper', isUser ? 'user' : isTool ? 'tool' : 'assistant')}>
            {!isEditing && <AttachmentGrid attachments={message.attachments || []} className="message-attachment-grid mb-2" />}

            {isEditing ? (
              <div className="chat-input-edit-container">
                <AttachmentGrid
                  attachments={attachments}
                  onRemove={removeAttachment}
                  className="chat-input-attachments"
                  itemClassName="chat-input-attachment-item"
                  imgClassName="chat-input-attachment-img"
                />
                <TextareaInput
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onPaste={onPaste}
                  className="chat-input-textarea overflow-hidden"
                  minRows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      setIsEditing(false);
                    }
                  }}
                  autoFocus
                />
                <div className="chat-input-edit-actions flex-between">
                  <div className="flex gap-1">
                    <FilePicker multiple accept="image/*" onFileSelect={onFileSelect} title="Attach Image" />
                    <ButtonInput
                      onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                      title="Search"
                      className={clsx('p-1!', isSearchEnabled && 'text-primary!')}
                    >
                      <Globe size={18} />
                    </ButtonInput>
                  </div>
                  <div className="flex gap-2">
                    <ButtonInput variant="secondary" onClick={() => setIsEditing(false)}>
                      Cancel
                    </ButtonInput>
                    <ButtonInput variant="primary" onClick={handleSaveEdit}>
                      {saveAfterEditing ? 'Save' : 'Regenerate'}
                    </ButtonInput>
                  </div>
                </div>
              </div>
            ) : (
              <div className={clsx(isUser ? 'message-bubble-user' : isTool ? 'message-bubble-tool' : 'message-bubble-assistant')}>
                {isThinking && !message.content ? (
                  <div className="message-thinking-container">
                    <div className="message-thinking-dot" />
                    <div className="message-thinking-dot message-thinking-dot-delay-1" />
                    <div className="message-thinking-dot message-thinking-dot-delay-2" />
                  </div>
                ) : (
                  <Markdown content={smoothedContent} components={markdownComponents} />
                )}
              </div>
            )}
          </div>

          {!isEditing && !readOnly && (
            <div className={clsx('message-action-bar', isThinking && 'opacity-0 pointer-events-none')}>
              <div className="message-actions">
                {siblingsList.length > 1 && (
                  <div className="message-branch-navigation">
                    <ButtonInput disabled={currentIndex === 0} onClick={() => handleSwitch(siblingsList[currentIndex - 1])} title="Previous">
                      <ChevronLeft size={16} />
                    </ButtonInput>
                    <div className="message-branch-indicator">
                      {currentIndex + 1}
                      <span className="message-branch-indicator-slash">/</span>
                      {siblingsList.length}
                    </div>
                    <ButtonInput
                      disabled={currentIndex === siblingsList.length - 1}
                      onClick={() => handleSwitch(siblingsList[currentIndex + 1])}
                      title="Next"
                    >
                      <ChevronRight size={16} />
                    </ButtonInput>
                  </div>
                )}

                <ButtonInput onClick={() => onBranch(threadId, message.id)} title="Branch">
                  <GitFork size={16} />
                </ButtonInput>

                <div className="relative">
                  <ButtonInput ref={regenerateTriggerRef} onClick={() => setIsRegenerateDropdownOpen(true)} title="Regenerate">
                    <RefreshCw size={16} />
                  </ButtonInput>

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
                      <div className="regenerate-input-wrapper">
                        <input
                          type="text"
                          className="regenerate-input"
                          placeholder="Ask to change response"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customInstruction.trim()) {
                              onRegenerate(threadId, message.id, { instruction: customInstruction.trim() });
                              setIsRegenerateDropdownOpen(false);
                              setCustomInstruction('');
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className={clsx(
                            'regenerate-submit-btn',
                            customInstruction.trim() ? 'bg-primary text-background' : 'text-text-tertiary opacity-50',
                          )}
                          onClick={() => {
                            if (customInstruction.trim()) {
                              onRegenerate(threadId, message.id, { instruction: customInstruction.trim() });
                              setIsRegenerateDropdownOpen(false);
                              setCustomInstruction('');
                            }
                          }}
                        >
                          <ArrowUp size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="py-1">
                      <DropdownItem
                        icon={RefreshCw}
                        label="Try again"
                        onClick={() => {
                          onRegenerate(threadId, message.id);
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon={ArrowUpDown}
                        label="Add details"
                        onClick={() => {
                          onRegenerate(threadId, message.id, {
                            instruction: 'Add more details and be more comprehensive.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon={Minimize2}
                        label="More concise"
                        onClick={() => {
                          onRegenerate(threadId, message.id, {
                            instruction: 'Make the response more concise and brief.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                      <DropdownItem
                        icon={Lightbulb}
                        label="Think longer"
                        onClick={() => {
                          onRegenerate(threadId, message.id, {
                            instruction: 'Think longer and provide a more deeply reasoned response.',
                          });
                          setIsRegenerateDropdownOpen(false);
                          setCustomInstruction('');
                        }}
                      />
                    </div>
                  </Dropdown>
                </div>

                <ButtonInput onClick={handleCopy} title="Copy">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </ButtonInput>

                <ButtonInput
                  onClick={() => {
                    setEditContent(message.content);
                    setAttachments(message.attachments || []);
                    setIsEditing(true);
                  }}
                  title="Edit"
                >
                  <Pencil size={16} />
                </ButtonInput>

                <ButtonInput
                  onClick={handleDelete}
                  variant="danger"
                  className="bg-transparent! text-text-secondary! hover:text-danger!"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </ButtonInput>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
