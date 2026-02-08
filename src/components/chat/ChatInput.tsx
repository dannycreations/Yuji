import clsx from 'clsx';
import { useRef, useState } from 'react';

import { useStore } from '../../hooks/useStore';
import { handleFilesFromEvent, handleFilesFromPaste } from '../../utilities/FileUtil';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { Button } from '../shared/Button';
import { Icon } from '../shared/Icon';
import { InputTextarea } from '../shared/InputArea';

import type { FC, KeyboardEvent } from 'react';
import type { Attachment } from '../../app/Schema';

interface ChatInputProps {
  readonly onSend: (text: string, attachments: Attachment[]) => void;
  readonly onStop: () => void;
  readonly isLoading: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, onStop, isLoading }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const settings = useStore((s) => s.settings);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isLoading) {
      onStop();
      return;
    }
    if (!input.trim() && attachments.length === 0) return;
    onSend(input, attachments);
    setInput('');
    setAttachments([]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAttachments = await handleFilesFromEvent(e);
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const newAttachments = await handleFilesFromPaste(e);
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="chat-input-wrapper">
      <input type="file" multiple accept="image/*" className="chat-input-file-input" ref={fileInputRef} onChange={handleFileSelect} />

      <div className="chat-input-container shadow-xl!">
        <AttachmentGrid
          attachments={attachments}
          onRemove={removeAttachment}
          className="chat-input-attachments scrollbar-hide"
          itemClassName="chat-input-attachment-item"
          imgClassName="chat-input-attachment-img"
        />

        <InputTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          debounceMs={0}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type your message here..."
          className="chat-input-textarea"
          minRows={2}
          maxRows={6}
        />

        <div className="chat-input-actions">
          <div className="chat-input-action-group">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Attach Image" className="!p-1">
              <Icon name="Plus" size={22} />
            </Button>

            <Button variant="ghost" size="icon" title="Search" className="!p-1">
              <Icon name="Globe" size={18} />
            </Button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim() && attachments.length === 0 && !isLoading}
            className={clsx('chat-input-submit', isLoading || input.trim() || attachments.length > 0 ? 'active' : 'inactive')}
          >
            {isLoading ? <Icon name="Square" size={16} fill="currentColor" /> : <Icon name="ArrowUp" size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};
