import clsx from 'clsx';
import { ArrowUp, Globe, Square } from 'lucide-react';
import { useRef, useState } from 'react';

import { useAttachment } from '../../hooks/useAttachment';
import { useStore } from '../../hooks/useStore';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { FilePicker } from '../shared/FilePicker';
import { InputButton, InputTextarea } from '../shared/InputArea';

import type { FC, KeyboardEvent } from 'react';
import type { Attachment } from '../../app/Schema';

interface ChatInputProps {
  readonly onSend: (text: string, attachments: Attachment[], options?: { readonly search?: boolean }) => void;
  readonly onStop: () => void;
  readonly isLoading: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, onStop, isLoading }) => {
  const [input, setInput] = useState('');
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const { attachments, onFileSelect, onPaste, removeAttachment, clearAttachments } = useAttachment();

  const settings = useStore((s) => s.settings);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    onSend(input, [...attachments], { search: isSearchEnabled });
    setInput('');
    clearAttachments();
    setIsSearchEnabled(false);
  };

  return (
    <div className="chat-input-wrapper">
      <div className="chat-input-container shadow-2xl">
        <AttachmentGrid
          attachments={[...attachments]}
          onRemove={removeAttachment}
          className="chat-input-attachments scrollbar-hide"
          itemClassName="chat-input-attachment-item"
          imgClassName="chat-input-attachment-img"
        />

        <InputTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder="Type your message here..."
          className="chat-input-textarea"
          minRows={2}
          maxRows={6}
        />

        <div className="chat-input-actions">
          <div className="chat-input-action-group">
            <FilePicker multiple accept="image/*" onFileSelect={onFileSelect} title="Attach Image" />

            <InputButton
              onClick={() => setIsSearchEnabled(!isSearchEnabled)}
              title="Search"
              className={clsx('p-1!', isSearchEnabled && 'text-primary!')}
            >
              <Globe size={18} />
            </InputButton>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim() && attachments.length === 0 && !isLoading}
            className={clsx('chat-input-submit', isLoading || input.trim() || attachments.length > 0 ? 'active' : 'inactive')}
          >
            {isLoading ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};
