import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { Message } from '../app/types';
import { useStore } from '../stores/useStore';
import { CodeBlock } from './CodeBlock';
import { Icon } from './shared/Icon';
import { VirtualBlock } from './shared/VirtualBlock';

interface MessageBubbleProps {
  message: Message;
  sessionId: string;
  isLast: boolean;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, sessionId, onRegenerate, onEdit }) => {
  const isUser = message.role === 'user';
  const { branchChat, sessions } = useStore();
  const [copied, setCopied] = useState(false);
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
  const { switchBranch } = useStore();

  const handleSwitchBranch = (newId: string) => {
    switchBranch(sessionId, newId);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBranch = () => {
    branchChat(sessionId, message.id);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() !== message.content) {
      onEdit(editContent);
    }
    setIsEditing(false);
  };

  return (
    <div className={clsx('group w-full border-b border-black/10 dark:border-white/5', isUser ? 'bg-transparent' : 'bg-transparent')}>
      <div className={clsx('max-w-3xl mx-auto py-6 flex gap-4 px-4 md:px-0', isUser && 'flex-row-reverse')}>
        <div
          className={clsx(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 shadow-sm',
            isUser ? 'bg-surface_light text-zinc-400' : 'bg-primary/10 text-primary',
          )}
        >
          {isUser ? <Icon name="User" size={16} /> : <Icon name="Sparkles" size={16} />}
        </div>

        <div className={clsx('flex-1 min-w-0 overflow-hidden')}>
          <div className={clsx('font-medium text-[13px] mb-1.5 text-zinc-400 flex items-center gap-2 select-none', isUser && 'justify-end')}>
            {isUser ? 'You' : 'Yuji'}
            <span className="text-[11px] text-zinc-600 font-normal">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {message.attachments && message.attachments.length > 0 && (
            <div className={clsx('flex flex-wrap gap-2 mb-3', isUser && 'justify-end')}>
              {message.attachments.map((att) => (
                <div key={att.id} className="relative group/att rounded-lg overflow-hidden border border-white/10 w-40 h-28 bg-surface">
                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {siblings.length > 1 && (
            <div
              className={clsx(
                'flex items-center gap-2 mb-2 text-[10px] text-zinc-500 font-bold uppercase tracking-widest select-none',
                isUser && 'justify-end',
              )}
            >
              <button
                disabled={currentIndex === 0}
                onClick={() => handleSwitchBranch(siblings[currentIndex - 1])}
                className="hover:text-primary disabled:opacity-30 transition-colors"
              >
                <Icon name="ChevronLeft" size={12} />
              </button>
              <span>
                {currentIndex + 1} / {siblings.length}
              </span>
              <button
                disabled={currentIndex === siblings.length - 1}
                onClick={() => handleSwitchBranch(siblings[currentIndex + 1])}
                className="hover:text-primary disabled:opacity-30 transition-colors"
              >
                <Icon name="ChevronRight" size={12} />
              </button>
            </div>
          )}

          {isEditing ? (
            <div className="w-full bg-black/20 border border-primary/40 rounded-xl overflow-hidden animate-fade-in">
              <TextareaAutosize
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-transparent p-4 text-zinc-200 text-sm focus:outline-none resize-none"
                minRows={2}
              />
              <div className="flex items-center justify-end gap-2 p-2 bg-black/20 border-t border-white/5">
                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary_hover transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none leading-relaxed markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const value = String(children).replace(/\n$/, '');
                    const isMultiline = value.includes('\n');

                    if (!inline && (match || isMultiline)) {
                      return (
                        <VirtualBlock>
                          <CodeBlock language={language} value={value} />
                        </VirtualBlock>
                      );
                    }

                    return (
                      <code className={clsx('bg-white/10 px-1.5 py-0.5 rounded text-[0.9em]', className)} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a: ({ node, ...props }) => (
                    <a
                      className="text-primary hover:text-primary_hover underline decoration-primary/30 underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                      {...props}
                    />
                  ),
                  ul: ({ node, ...props }) => (
                    <VirtualBlock>
                      <ul className="list-disc pl-4 space-y-1.5 my-3 text-zinc-300" {...props} />
                    </VirtualBlock>
                  ),
                  ol: ({ node, ...props }) => (
                    <VirtualBlock>
                      <ol className="list-decimal pl-4 space-y-1.5 my-3 text-zinc-300" {...props} />
                    </VirtualBlock>
                  ),
                  h1: ({ node, ...props }) => (
                    <VirtualBlock>
                      <h1 className="text-xl font-bold mt-6 mb-3 text-white" {...props} />
                    </VirtualBlock>
                  ),
                  h2: ({ node, ...props }) => (
                    <VirtualBlock>
                      <h2 className="text-lg font-bold mt-5 mb-2.5 text-white" {...props} />
                    </VirtualBlock>
                  ),
                  h3: ({ node, ...props }) => (
                    <VirtualBlock>
                      <h3 className="text-base font-bold mt-4 mb-2 text-zinc-100" {...props} />
                    </VirtualBlock>
                  ),
                  blockquote: ({ node, ...props }) => (
                    <VirtualBlock>
                      <blockquote className="border-l-4 border-primary/50 pl-3 py-0.5 my-3 italic text-zinc-400 bg-white/5 rounded-r-lg" {...props} />
                    </VirtualBlock>
                  ),
                  table: ({ node, ...props }) => (
                    <VirtualBlock>
                      <div className="overflow-x-auto my-4 rounded-lg border border-white/10">
                        <table className="min-w-full divide-y divide-white/10 bg-surface" {...props} />
                      </div>
                    </VirtualBlock>
                  ),
                  th: ({ node, ...props }) => (
                    <th className="px-3 py-2 bg-white/5 text-left text-[11px] font-semibold text-zinc-300 uppercase tracking-wider" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="px-3 py-2 whitespace-nowrap text-[13px] text-zinc-400 border-t border-white/5" {...props} />
                  ),
                  p: ({ node, ...props }) => {
                    const content = String(props.children);
                    if (content.startsWith('<reasoning>') && content.endsWith('</reasoning>')) {
                      return (
                        <VirtualBlock>
                          <details className="mb-4 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                            <summary className="px-3 py-2 text-[11px] font-bold text-zinc-500 cursor-pointer hover:bg-white/5 transition-colors uppercase tracking-widest flex items-center gap-2">
                              <Icon name="Brain" size={12} />
                              Reasoning
                            </summary>
                            <div className="px-4 py-3 text-zinc-400 text-[13px] italic leading-relaxed bg-black/20">
                              {content.replace(/<\/?reasoning>/g, '')}
                            </div>
                          </details>
                        </VirtualBlock>
                      );
                    }
                    return (
                      <VirtualBlock>
                        <p className="mb-3 last:mb-0 leading-6 text-zinc-200" {...props} />
                      </VirtualBlock>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          <div
            className={clsx(
              'flex items-center gap-2.5 mt-3 pt-1.5 border-t border-transparent group-hover:border-white/5 transition-colors opacity-0 group-hover:opacity-100',
              isUser && 'justify-end',
            )}
          >
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Icon name={copied ? 'Check' : 'Copy'} size={12} />
              <span className="text-[10px] font-medium uppercase tracking-tight">Copy</span>
            </button>
            <button
              onClick={handleBranch}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Icon name="GitFork" size={12} />
              <span className="text-[10px] font-medium uppercase tracking-tight">Branch</span>
            </button>

            {isUser && !isEditing && (
              <button
                onClick={() => {
                  setEditContent(message.content);
                  setIsEditing(true);
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Icon name="Pencil" size={12} />
                <span className="text-[10px] font-medium uppercase tracking-tight">Edit</span>
              </button>
            )}

            {!isUser && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Icon name="RefreshCw" size={12} />
                <span className="text-[10px] font-medium uppercase tracking-tight">Regenerate</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
