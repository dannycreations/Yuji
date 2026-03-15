import clsx from 'clsx';
import { ArrowUp, ChevronUp, Globe, Square } from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentModelId, getModelName } from '../../helpers/ModelHelper';
import { useAttachment } from '../../hooks/useAttachment';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useChatAction, useStore, useStoreAction } from '../../hooks/useStore';
import { AttachmentGrid } from '../shared/AttachmentGrid';
import { ButtonInput, TextareaInput } from '../shared/InputArea';
import { FilePicker, ModelPicker } from '../shared/PickerArea';

import type { FC, KeyboardEvent } from 'react';
import type { Attachment, GlobalSetting } from '../../app/Schema';

interface ChatInputProps {
  readonly onSend: (text: string, attachments: Attachment[], options?: { readonly search?: boolean }) => void;
  readonly onStop: () => void;
  readonly isLoading: boolean;
  readonly initialInput?: string;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, onStop, isLoading, initialInput }) => {
  const [input, setInput] = useState('');

  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
      textareaRef.current?.focus();
    }
  }, [initialInput]);

  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const { attachments, onFileSelect, onPaste, removeAttachment, clearAttachments } = useAttachment();

  const settings = useStore((s) => s.settings);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeThread = useStore((s) => s.activeThread);
  const availableModels = useStore((s) => s.availableModels);

  const updateSetting = useStoreAction((s, updates: Partial<GlobalSetting>) => s.updateSetting(updates));
  const updateThreadModel = useChatAction((c, model: string) =>
    c.updateActiveThread((s) => ({
      ...s,
      general: { ...s.general, model },
    })),
  );

  const [showModelPicker, setShowModelPicker] = useState(false);
  const [optimisticModelId, setOptimisticModelId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useClickOutside(pickerRef, () => setShowModelPicker(false));

  const currentModelId = useMemo(() => getCurrentModelId(activeThread, settings, availableModels), [settings, availableModels, activeThread]);

  const handleModelSelect = (modelId: string) => {
    setOptimisticModelId(modelId);
    setShowModelPicker(false);

    startTransition(() => {
      updateSetting({ model: modelId });
      if (activeThreadId) {
        updateThreadModel(modelId);
      }
    });
  };

  const isOptimisticResolved = optimisticModelId !== null && optimisticModelId === currentModelId;
  if (isOptimisticResolved) {
    setOptimisticModelId(null);
  }

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

    const trimmedInput = input.trim();
    const hasAttachments = attachments.length > 0;
    if (!trimmedInput && !hasAttachments) {
      return;
    }

    onSend(trimmedInput, [...attachments], {
      search: isSearchEnabled,
    });
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

        <TextareaInput
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
            <div className="relative" ref={pickerRef}>
              <ButtonInput onClick={() => setShowModelPicker(!showModelPicker)} title="Select Model" className="p-1! gap-1">
                <span className="text-xs font-bold text-text-secondary pl-1 truncate max-w-[120px]">
                  {getModelName(availableModels, optimisticModelId || currentModelId)}
                </span>
                <ChevronUp size={14} className="text-text-secondary" />
              </ButtonInput>

              <ModelPicker
                isOpen={showModelPicker}
                triggerRef={pickerRef}
                ignoreRef={pickerRef}
                className="model-picker-dropdown -translate-y-3"
                currentModel={currentModelId}
                onSelect={handleModelSelect}
                onClose={() => setShowModelPicker(false)}
              />
            </div>

            <FilePicker multiple accept="image/*" onFileSelect={onFileSelect} title="Attach Image" />

            <ButtonInput
              onClick={() => setIsSearchEnabled(!isSearchEnabled)}
              title="Search"
              className={clsx('p-1!', isSearchEnabled && 'text-primary!')}
            >
              <Globe size={18} />
            </ButtonInput>
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
