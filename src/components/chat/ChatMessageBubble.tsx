import clsx from 'clsx';
import { memo, useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useChatAction } from '../../hooks/useChatAction';
import { useCopy } from '../../hooks/useCopy';
import { useConfirm, useStore } from '../../hooks/useStore';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { Button } from '../shared/Button';
import { Icon } from '../shared/Icon';
import { InputTextarea } from '../shared/InputArea';
import { ChatMessageBlock } from './ChatMessageBlock';

import type { FC } from 'react';
import type { Components } from 'react-markdown';
import type { ChatMessage } from '../../app/Schema';

const Markdown = memo(({ content, components }: { content: string; components: Components }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
    {content}
  </ReactMarkdown>
));

interface ChatMessageBubbleProps {
  readonly message: ChatMessage;
  readonly sessionId: string;
  readonly isLast: boolean;
  readonly isThinking?: boolean;
  readonly onUpdateHeight?: () => void;
}

export const ChatMessageBubble: FC<ChatMessageBubbleProps> = memo(({ message, sessionId, isThinking, onUpdateHeight }) => {
  const isUser = message.role === 'user';
  const childrenIds = useStore(
    (s) => {
      if (!message.parentId) return undefined;
      const session = s.activeSession;
      if (!session || session.id !== sessionId) return undefined;
      return session.messages[message.parentId!]?.childrenIds;
    },
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );

  const [copied, setCopy] = useCopy();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const { handleBranch, handleSwitchBranch, handleDeleteMessage, handleRegenerate, handleEdit } = useChatAction();

  // Logic to find siblings for navigation
  const siblings = childrenIds || [];

  const currentIndex = siblings.indexOf(message.id);

  const handleSwitch = (newId: string) => {
    handleSwitchBranch(sessionId, newId);
  };

  const handleCopy = () => setCopy(message.content);

  const handleSaveEdit = useCallback(() => {
    if (editContent.trim() !== message.content.trim()) {
      handleEdit(sessionId, message.id, editContent);
      onUpdateHeight?.();
    }
    setIsEditing(false);
  }, [editContent, message.content, sessionId, message.id, handleEdit, onUpdateHeight]);

  const onConfirm = useConfirm();

  const handleDelete = () =>
    onConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      confirmLabel: 'Delete',
      onConfirm: () => handleDeleteMessage(sessionId, message.id),
    });

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
    <div className="group w-full" data-message-id={message.id}>
      <div className={clsx('message-row', isUser ? 'user' : 'assistant')}>
        <div className={clsx('message-container', isUser ? 'user' : 'assistant')}>
          <div className={clsx('message-content-wrapper', isUser ? 'user' : 'assistant')}>
            <AttachmentGrid
              attachments={message.attachments || []}
              className="message-attachment-grid mb-2"
              itemClassName="message-attachment-item"
              imgClassName="message-attachment-img"
            />

            {isEditing ? (
              <div className="chat-input-edit-container">
                <InputTextarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="chat-input-textarea !overflow-hidden"
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
                <div className="chat-input-edit-actions">
                  <Button onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button variant="primary" onClick={handleSaveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className={clsx(isUser ? 'message-bubble-user' : 'message-bubble-assistant')}>
                {isThinking && !message.content ? (
                  <div className="message-thinking-container">
                    <div className="message-thinking-dot" />
                    <div className="message-thinking-dot [animation-delay:0.2s]" />
                    <div className="message-thinking-dot [animation-delay:0.4s]" />
                  </div>
                ) : (
                  <Markdown content={message.content} components={markdownComponents} />
                )}
              </div>
            )}
          </div>

          {!isEditing && (
            <div className={clsx('message-action-bar', isThinking && 'opacity-0 pointer-events-none')}>
              <div className="message-actions">
                {siblings.length > 1 && (
                  <div className="message-branch-navigation">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={currentIndex === 0}
                      onClick={() => handleSwitch(siblings[currentIndex - 1])}
                      title="Previous Version"
                    >
                      <Icon name="ChevronLeft" size={16} />
                    </Button>
                    <span className="message-branch-indicator">
                      {currentIndex + 1}
                      <span className="text-text-tertiary mx-0.5">/</span>
                      {siblings.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={currentIndex === siblings.length - 1}
                      onClick={() => handleSwitch(siblings[currentIndex + 1])}
                      title="Next Version"
                    >
                      <Icon name="ChevronRight" size={16} />
                    </Button>
                  </div>
                )}

                <Button variant="ghost" size="icon" onClick={() => handleBranch(sessionId, message.id)} title="Branch">
                  <Icon name="GitFork" size={16} />
                </Button>

                <Button variant="ghost" size="icon" onClick={() => handleRegenerate(sessionId, message.id)} title="Regenerate">
                  <Icon name="RefreshCw" size={16} />
                </Button>

                <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy">
                  <Icon name={copied ? 'Check' : 'Copy'} size={16} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditContent(message.content);
                    setIsEditing(true);
                  }}
                  title="Edit"
                >
                  <Icon name="Pencil" size={16} />
                </Button>

                <Button variant="ghost" size="icon" onClick={handleDelete} className="hover:!text-danger" title="Delete">
                  <Icon name="Trash2" size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
