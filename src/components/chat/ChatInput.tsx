import clsx from 'clsx';
import { useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../../app/Constant';
import { useStore } from '../../hooks/useStore';
import { Icon } from '../shared/Icon';
import { InputTextarea } from '../shared/InputArea';

import type { ChangeEvent, FC, KeyboardEvent } from 'react';
import type { AppState, Attachment } from '../../app/Schema';

interface ChatInputProps {
  readonly onSend: (text: string, attachments: Attachment[]) => void;
  readonly onStop: () => void;
  readonly isLoading: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, onStop, isLoading }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);

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

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files: File[] = Array.from(e.target.files);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            if (loadEvent.target?.result) {
              const newAttachment: Attachment = {
                id: crypto.randomUUID(),
                type: 'image',
                url: loadEvent.target.result as string,
                name: file.name,
              };
              setAttachments((prev) => [...prev, newAttachment]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="chat-input-wrapper">
      <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />

      <div className="chat-input-container">
        {attachments.length > 0 && (
          <div className="flex gap-2.5 px-4 pt-3.5 overflow-x-auto scrollbar-hide">
            {attachments.map((att) => (
              <div key={att.id} className="relative group w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden border border-line">
                <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-0.5 right-0.5 bg-overlay text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Icon name="X" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <InputTextarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          className="bg-transparent border-none focus:border-none px-4 py-4 text-sm max-h-[200px]"
          minRows={1}
          maxRows={10}
        />

        <div className="flex items-center justify-between px-2 pb-2 relative">
          <div className="flex items-center gap-0.5">
            <button onClick={() => fileInputRef.current?.click()} className="btn-icon rounded-full" title="Attach Image">
              <Icon name="Plus" size={24} />
            </button>

            <button className="btn-icon rounded-full" title="Search">
              <Icon name="Globe" size={20} />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!input.trim() && attachments.length === 0 && !isLoading}
            className={clsx(
              'p-2 rounded-full transition-all duration-200',
              isLoading || input.trim() || attachments.length > 0
                ? 'bg-text-primary text-background hover:opacity-90'
                : 'bg-surface-hover text-text-secondary cursor-not-allowed',
            )}
          >
            {isLoading ? <Icon name="Square" size={16} fill="currentColor" /> : <Icon name="ArrowUp" size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};
