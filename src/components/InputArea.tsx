import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { Attachment } from '../app/types';
import { useStore } from '../stores/useStore';
import { Icon } from './Icon';
import { ModelPicker } from './ModelPicker';

interface InputAreaProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  isLoading: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, onStop, isLoading }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const { settings, activeSessionId, sessions, updateSettings, setSessionModel, setSessionSystemPrompt } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const currentModel = activeSession?.modelConfig?.model || settings.defaultModel;

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const handleModelSelect = (modelId: string) => {
    if (activeSessionId) {
      setSessionModel(activeSessionId, modelId);
    } else {
      updateSettings({ defaultModel: modelId });
    }
    setShowModelPicker(false);
  };

  return (
    <>
      {showModelPicker && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowModelPicker(false)} />}
      <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1 z-20">
        <div className="flex items-center justify-between mb-2">
          {activeSession && (
            <div className="flex items-center gap-2 group/system">
              <Icon name="Shield" size={12} className="text-zinc-600 group-hover/system:text-primary transition-colors" />
              <input
                type="text"
                value={activeSession.systemPrompt || ''}
                onChange={(e) => setSessionSystemPrompt(activeSession.id, e.target.value)}
                placeholder="Set chat system prompt..."
                className="bg-transparent border-none text-[10px] text-zinc-600 focus:text-zinc-300 focus:ring-0 w-64 truncate transition-colors outline-none"
              />
            </div>
          )}
          <div className="flex-1" />
        </div>
        <div className="flex items-center justify-between mb-2">
          {activeSession && (
            <div className="flex items-center gap-2 group/system">
              <Icon name="Shield" size={12} className="text-zinc-600 group-hover/system:text-primary transition-colors" />
              <input
                type="text"
                value={activeSession.systemPrompt || ''}
                onChange={(e) => setSessionSystemPrompt(activeSession.id, e.target.value)}
                placeholder="Set chat system prompt..."
                className="bg-transparent border-none text-[10px] text-zinc-600 focus:text-zinc-300 focus:ring-0 w-64 truncate transition-colors outline-none"
              />
            </div>
          )}
          <div className="flex-1" />
        </div>
        <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />

        <div
          className={clsx(
            'relative flex flex-col w-full bg-surface_light rounded-2xl border border-white/10 shadow-xl transition-all overflow-visible',
            'focus-within:ring-1 focus-within:ring-primary/50 focus-within:border-primary/50',
          )}
        >
          {attachments.length > 0 && (
            <div className="flex gap-2.5 px-3.5 pt-3.5 overflow-x-auto scrollbar-hide">
              {attachments.map((att) => (
                <div key={att.id} className="relative group w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border border-white/10">
                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Icon name="X" size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <TextareaAutosize
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${currentModel}...`}
            className="w-full bg-transparent text-white placeholder-zinc-500 px-4 py-3.5 focus:outline-none resize-none overflow-y-auto text-[15px]"
            minRows={1}
            maxRows={10}
            disabled={isLoading && false} // Keep enabled to allow queuing or typing next thought (though UI is locked for now)
          />

          <div className="flex items-center justify-between px-3 pb-3 relative">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all text-[11px] font-medium group border',
                    showModelPicker ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5',
                  )}
                >
                  <span>{currentModel}</span>
                  <Icon
                    name="ChevronDown"
                    size={10}
                    className={clsx('transition-colors', showModelPicker ? 'text-primary' : 'text-zinc-500 group-hover:text-zinc-300')}
                  />
                </button>
                {showModelPicker && (
                  <ModelPicker currentModel={currentModel} onSelect={handleModelSelect} onClose={() => setShowModelPicker(false)} />
                )}
              </div>

              <button className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors" title="Search">
                <Icon name="Globe" size={16} />
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                title="Attach Image"
              >
                <Icon name="Plus" size={18} />
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!input.trim() && attachments.length === 0 && !isLoading}
              className={clsx(
                'p-2 rounded-xl transition-all duration-200',
                isLoading
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : input.trim() || attachments.length > 0
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary_hover scale-100'
                    : 'bg-white/5 text-zinc-600 cursor-not-allowed scale-95',
              )}
            >
              {isLoading ? <Icon name="Square" size={16} fill="currentColor" /> : <Icon name="ArrowUp" size={18} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
