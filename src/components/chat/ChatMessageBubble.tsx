import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { YujiRuntime } from '../../app/Yuji';
import { useCopy } from '../../hooks/useCopy';
import { useAction, useConfirm, useStore } from '../../hooks/useStore';
import { ChatService } from '../../services/ChatService';
import { Icon } from '../shared/Icon';
import { InputTextarea } from '../shared/InputArea';
import { ChatMessageBlock } from './ChatMessageBlock';

import type { FC } from 'react';
import type { Components } from 'react-markdown';
import type { AppState, Message } from '../../app/Schema';

interface ChatMessageBubbleProps {
  readonly message: Message;
  readonly sessionId: string;
  readonly isLast: boolean;
  readonly isThinking?: boolean;
  readonly onRegenerate: () => void;
  readonly onEdit: (content: string) => void;
}

export const ChatMessageBubble: FC<ChatMessageBubbleProps> = ({ message, sessionId, onRegenerate, onEdit, isThinking }) => {
  const isUser = message.role === 'user';
  const sessions = useStore((s: AppState) => s.sessions, {});
  const [copied, setCopy] = useCopy();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const session = sessions[sessionId];

  // Logic to find siblings for navigation
  const siblings = useMemo(() => {
    if (!message.parentId || !session) return [];
    const parent = session.messages.find((m) => m.id === message.parentId);
    return parent?.childrenIds || [];
  }, [message.parentId, session]);

  const currentIndex = siblings.indexOf(message.id);

  const switchBranch = useAction((sessionId: string, messageId: string) =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.updateSession(sessionId, (session) => ({
        ...session,
        activeMessageId: messageId,
      }));
    }),
  );

  const handleSwitchBranch = (newId: string) => {
    switchBranch(sessionId, newId);
  };

  const handleCopy = () => setCopy(message.content);

  const handleBranch = useAction(() =>
    Effect.gen(function* () {
      const chat = yield* ChatService;
      yield* chat.branchChat(sessionId, message.id);
    }),
  );

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content.trim()) onEdit(editContent);
    setIsEditing(false);
  };

  const showConfirm = useConfirm();

  const handleDelete = () => {
    showConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () =>
        YujiRuntime.runFork(
          Effect.gen(function* () {
            const chat = yield* ChatService;
            yield* chat.deleteMessage(sessionId, message.id);
          }),
        ),
    });
  };

  const markdownComponents = useMemo<Components>(
    () => ({
      code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';
        const value = String(children).replace(/\n$/, '');
        const isMultiline = value.includes('\n');

        if (match || isMultiline || (node && node.position?.start.column === 1)) {
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
        <div className="prose-table-container">
          <table className="prose-table" {...props} />
        </div>
      ),
      th: ({ node, ...props }) => <th className="prose-th" {...props} />,
      td: ({ node, ...props }) => <td className="prose-td" {...props} />,
      p: ({ node, ...props }) => <div className="prose-p" {...props} />,
    }),
    [],
  );

  return (
    <div className="group w-full">
      <div className={clsx('message-row', isUser && 'user')}>
        <div className={clsx('message-container', isUser ? 'user' : 'assistant')}>
          <div className={clsx('message-content-wrapper', isUser ? 'user' : 'assistant')}>
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachment-grid">
                {message.attachments.map((att) => (
                  <div key={att.id} className="message-attachment-item">
                    <img src={att.url} alt={att.name} className="message-attachment-img" />
                  </div>
                ))}
              </div>
            )}

            {isEditing ? (
              <div className="chat-input-edit-container">
                <InputTextarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="chat-input-textarea" minRows={2} />
                <div className="chat-input-edit-actions">
                  <button onClick={() => setIsEditing(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} className="btn-primary">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className={clsx('prose-chat', isUser ? 'message-bubble-user' : 'message-bubble-assistant')}>
                {isThinking && !message.content ? (
                  <div className="message-thinking-container">
                    <div className="message-thinking-dot" />
                    <div className="message-thinking-dot [animation-delay:0.2s]" />
                    <div className="message-thinking-dot [animation-delay:0.4s]" />
                  </div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>

          {!isEditing && (
            <div className={clsx('flex items-center mt-2 h-6 transition-opacity duration-200', isThinking && 'opacity-0 pointer-events-none')}>
              <div className="message-actions">
                {siblings.length > 1 && (
                  <div className="flex items-center gap-1 text-text-primary select-none font-medium">
                    <button disabled={currentIndex === 0} onClick={() => handleSwitchBranch(siblings[currentIndex - 1])} className="btn-icon">
                      <Icon name="ChevronLeft" size={16} />
                    </button>
                    <span className="text-sm tabular-nums mx-1">
                      {currentIndex + 1}/{siblings.length}
                    </span>
                    <button
                      disabled={currentIndex === siblings.length - 1}
                      onClick={() => handleSwitchBranch(siblings[currentIndex + 1])}
                      className="btn-icon"
                    >
                      <Icon name="ChevronRight" size={16} />
                    </button>
                  </div>
                )}

                <button onClick={handleBranch} className="btn-icon" title="Branch">
                  <Icon name="GitFork" size={16} />
                </button>

                <button onClick={onRegenerate} className="btn-icon" title="Regenerate">
                  <Icon name="RefreshCw" size={16} />
                </button>

                <button onClick={handleCopy} className="btn-icon" title="Copy">
                  <Icon name={copied ? 'Check' : 'Copy'} size={16} />
                </button>

                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditContent(message.content);
                      setIsEditing(true);
                    }}
                    className="btn-icon"
                    title="Edit"
                  >
                    <Icon name="Pencil" size={16} />
                  </button>
                )}

                <button onClick={handleDelete} className="btn-icon hover:text-danger" title="Delete">
                  <Icon name="Trash2" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
