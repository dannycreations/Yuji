import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { getFilteredModels, getModelId } from '../../helpers/ModelHelper';
import { getMessagePath, sortThreadsByDate } from '../../helpers/ThreadHelper';
import { useStoreAction, useStoreEffect } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { ChatService } from '../../services/ChatService';
import { downloadFile } from '../../utilities/CommonUtil';
import { timeAgo } from '../../utilities/TimeUtil';
import { ChatMessageBubble } from '../chat/ChatMessageBubble';
import { Button } from '../shared/Button';
import { Checkbox } from '../shared/Checkbox';
import { Icon } from '../shared/Icon';
import { InputSearch, InputSelect, InputSwitch, InputTag, InputText, InputTextarea } from '../shared/InputArea';
import { FullscreenModal } from '../shared/modal/FullscreenModal';
import { ModelItem } from '../shared/ModelItem';

import type { ChangeEvent, FC, ReactNode } from 'react';
import type {
  AppRuntimeState,
  ChatMetadata,
  ChatThread,
  ConfirmOptions,
  GlobalSettings,
  Instruction,
  Model,
  Personalisation,
} from '../../app/Schema';

export const SectionWrapper: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('animate-fade-in flex flex-col scrollable-section', className)}>{children}</div>
);

export const SettingItem: FC<{ label: string; description?: string; children: ReactNode; className?: string }> = ({
  label,
  description,
  children,
  className,
}) => (
  <div className={clsx('panel-section flex-between gap-4', className)}>
    <div className="flex-1 min-w-0">
      <div className="text-sm text-text-primary">{label}</div>
      {description && <div className="text-xs text-text-tertiary mt-0.5">{description}</div>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

export const SettingField: FC<{ label: string; children: ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={clsx('space-y-2', className)}>
    <label className="settings-label">{label}</label>
    {children}
  </div>
);

interface SettingSectionProps {
  readonly settings: GlobalSettings;
  readonly onChange: (updates: Partial<GlobalSettings> | ((s: GlobalSettings) => GlobalSettings)) => void;
}

export const GeneralSection: FC<SettingSectionProps> = ({ settings, onChange }) => {
  return (
    <SectionWrapper>
      <SettingItem label="Appearance">
        <InputSelect
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as 'dark' | 'light' })}
          className="py-1.5! text-xs! min-w-[100px]"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </InputSelect>
      </SettingItem>

      <SettingItem label="Enter to send" description="Send the message by pressing the Enter key.">
        <InputSwitch checked={settings.enterToSend} onChange={(checked) => onChange({ enterToSend: checked })} />
      </SettingItem>

      <SettingItem label="Expand code blocks" description="Automatically expand code blocks to show full content.">
        <InputSwitch checked={settings.expandCodeblock} onChange={(checked) => onChange({ expandCodeblock: checked })} />
      </SettingItem>

      <SettingItem label="Show suggestions" description="Show prompt suggestions on the initial chat page.">
        <InputSwitch checked={settings.showSuggestions} onChange={(checked) => onChange({ showSuggestions: checked })} />
      </SettingItem>

      <SettingItem label="Save after editing" description="If disabled, the save button will be changed to regenerate.">
        <InputSwitch checked={settings.saveAfterEditing} onChange={(checked) => onChange({ saveAfterEditing: checked })} />
      </SettingItem>
    </SectionWrapper>
  );
};

export const ConnectionSection: FC<SettingSectionProps> = ({ settings, onChange }) => {
  return (
    <SectionWrapper className="space-y-3">
      <SettingField label="API Provider">
        <InputSelect value="openai" disabled>
          <option value="openai">OpenAI Compatible</option>
        </InputSelect>
      </SettingField>

      <SettingField label="Base URL">
        <InputText
          leftIcon="Link"
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />
      </SettingField>

      <SettingField label="API Key">
        <InputText
          type="password"
          leftIcon="Key"
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </SettingField>
    </SectionWrapper>
  );
};

export const ModelsSection: FC<SettingSectionProps & { availableModels: readonly Model[] }> = ({ settings, availableModels, onChange }) => {
  const updateStore = useStoreAction((s, f: (state: AppRuntimeState) => AppRuntimeState) => s.update(f));
  const [modelSearch, setModelSearch] = useState('');

  const setAvailableModels = (models: Model[]) => updateStore((s: AppRuntimeState) => ({ ...s, availableModels: models }));

  const handleRefreshModels = useStoreEffect(() =>
    Effect.gen(function* () {
      const llm = yield* LLMProvider;
      const result = yield* llm.fetchModels(settings);

      const apiModels: Model[] = result.data.map((m) => ({
        id: m.id,
        name: m.id,
        description: `Fetched from ${settings.baseUrl}`,
        provider: 'OpenAI Compatible',
        icon: 'Cpu',
        color: 'text-text-tertiary',
        tags: ['API'],
        isNew: false,
        premium: false,
      }));

      const staticIds = new Set(availableModels.map((m) => m.id));
      const newModels = apiModels.filter((m) => !staticIds.has(m.id));

      setAvailableModels([...availableModels, ...newModels]);
    }),
  );

  const filteredModels = useMemo(
    () => getFilteredModels(availableModels, settings.disabledModels, modelSearch, { includeDisabled: true, sort: true }),
    [availableModels, modelSearch, settings.disabledModels],
  );

  const toggleModel = (modelId: string) => {
    const isDisabled = settings.disabledModels.includes(modelId);
    const newDisabledModels = isDisabled ? settings.disabledModels.filter((id) => id !== modelId) : [...settings.disabledModels, modelId];
    onChange({ disabledModels: newDisabledModels });
  };

  const effectiveModelId = getModelId(settings, availableModels);

  return (
    <SectionWrapper className="space-y-3">
      <div className="flex-shrink-0 flex gap-2">
        <div className="flex-1">
          <InputSearch value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models..." />
        </div>
        <Button variant="ghost" className="badge-outline whitespace-nowrap" onClick={handleRefreshModels} title="Refresh Library">
          <Icon name="RefreshCw" size={14} />
          <span>Refresh</span>
        </Button>
      </div>

      <div className="flex-1 min-h-0 space-y-2">
        {filteredModels.length > 0 ? (
          filteredModels.map((model) => {
            const isEnabled = !settings.disabledModels.includes(model.id);
            return (
              <ModelItem
                key={model.id}
                model={model}
                availableModels={availableModels}
                isEnabled={isEnabled}
                isDefault={effectiveModelId === model.id}
                className={clsx('settings-model-card !p-3 cursor-default', isEnabled ? 'enabled' : 'disabled')}
                rightContent={<InputSwitch checked={isEnabled} onChange={() => toggleModel(model.id)} />}
              />
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-3 text-text-tertiary bg-line rounded-xl border border-dashed border-separator">
            <Icon name="Search" size={24} className="mb-2 opacity-50" />
            <p className="text-sm">No models match "{modelSearch}"</p>
          </div>
        )}
      </div>
    </SectionWrapper>
  );
};

interface SettingTableProps<T> {
  info: string;
  headerPrefix?: ReactNode;
  headerLabel?: string;
  headerActions?: ReactNode;
  items: T[];
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  renderRow: (item: T, index: number) => ReactNode;
  emptyIcon: string;
  emptyLabel: string;
  children?: ReactNode;
}

export const SettingTable = <T,>({
  info,
  headerPrefix,
  headerLabel = 'Title',
  headerActions,
  items,
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  renderRow,
  emptyIcon,
  emptyLabel,
  children,
}: SettingTableProps<T>) => {
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <SectionWrapper className="space-y-3">
      {children}
      <div className="flex flex-col gap-3 flex-shrink-0">
        <p className="settings-info-box">{info}</p>
      </div>

      <div className="settings-history-table">
        <div className="settings-history-header">
          {headerPrefix}
          <div className={clsx('flex-1 label-caps text-text-primary', !headerPrefix && 'pl-3')}>{headerLabel}</div>
          <div className={clsx('flex items-center gap-2', !headerPrefix && 'pr-3')}>{headerActions}</div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-separator">
          {items.length > 0 ? (
            items.map((item, index) => renderRow(item, index))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
              <Icon name={emptyIcon as any} size={32} className="opacity-20" />
              <p className="text-sm">{emptyLabel}</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex-between pt-2 flex-shrink-0">
          <div className="text-xs text-text-tertiary">
            Page {currentPage + 1} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="flex-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Icon name="ChevronLeft" size={12} />
              Prev
            </Button>
            <Button
              variant="ghost"
              onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="flex-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <Icon name="ChevronRight" size={12} />
            </Button>
          </div>
        </div>
      )}
    </SectionWrapper>
  );
};

export const HistorySection: FC<{ threads: Record<string, ChatMetadata> }> = ({ threads }) => {
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 6;

  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));
  const importThreads = useStoreEffect((newThreads: Record<string, ChatThread>) =>
    Effect.flatMap(ChatService, (chat) => chat.importThreads(newThreads)),
  );
  const deleteThreads = useStoreEffect((ids: Set<string>) => Effect.flatMap(ChatService, (chat) => chat.deleteThreads(ids)));

  const handleExport = () => {
    let dataToExport = threads;
    if (selectedThreadIds.size > 0) {
      dataToExport = Object.fromEntries(Object.entries(threads).filter(([id]) => selectedThreadIds.has(id)));
    }
    downloadFile(JSON.stringify(dataToExport), `yuji-history-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          importThreads(json);
        }
      } catch (err) {
        console.error('Failed to parse history file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSelected = () => {
    if (selectedThreadIds.size === 0) return;
    showConfirm({
      title: 'Delete History',
      message: `Are you sure you want to delete **${selectedThreadIds.size}** selected thread${selectedThreadIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        deleteThreads(selectedThreadIds);
        setSelectedThreadIds(new Set());
      },
    });
  };

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads).filter((t) => !t.archived)), [threads]);
  const currentHistoryItems = sortedThreads.slice(historyPage * ITEMS_PER_PAGE, (historyPage + 1) * ITEMS_PER_PAGE);

  const toggleSelectAll = () => {
    if (selectedThreadIds.size === currentHistoryItems.length) {
      setSelectedThreadIds(new Set());
    } else {
      setSelectedThreadIds(new Set(currentHistoryItems.map((s) => s.id)));
    }
  };

  const toggleSelectThread = (id: string) => {
    const next = new Set(selectedThreadIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedThreadIds(next);
  };

  return (
    <SettingTable
      info="Back up your conversation history or migrate it to another device. Importing data will merge with your existing conversations."
      items={currentHistoryItems}
      totalItems={sortedThreads.length}
      currentPage={historyPage}
      pageSize={ITEMS_PER_PAGE}
      onPageChange={setHistoryPage}
      emptyIcon="Inbox"
      emptyLabel="No chat history available."
      headerPrefix={
        <div className="settings-history-checkbox-col">
          <Checkbox
            checked={currentHistoryItems.length > 0 && currentHistoryItems.every((s) => selectedThreadIds.has(s.id))}
            indeterminate={
              currentHistoryItems.length > 0 &&
              !currentHistoryItems.every((s) => selectedThreadIds.has(s.id)) &&
              currentHistoryItems.some((s) => selectedThreadIds.has(s.id))
            }
            onChange={toggleSelectAll}
          />
        </div>
      }
      headerActions={
        <>
          {selectedThreadIds.size > 0 && (
            <Button variant="ghost" onClick={handleDeleteSelected} className="badge-outline bg-danger/10! text-danger! border-danger/20">
              <Icon name="Trash2" size={12} />
              Delete ({selectedThreadIds.size})
            </Button>
          )}
          <Button variant="ghost" onClick={handleExport} className="badge-outline text-text-primary!">
            <Icon name="Upload" size={12} />
            Export {selectedThreadIds.size > 0 ? `(${selectedThreadIds.size})` : ''}
          </Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} className="badge-outline text-text-primary!">
            <Icon name="Download" size={12} />
            Import
          </Button>
        </>
      }
      renderRow={(thread) => (
        <div key={thread.id} className={clsx('settings-history-row', selectedThreadIds.has(thread.id) && 'settings-history-row-active')}>
          <div className="settings-history-checkbox-col">
            <Checkbox checked={selectedThreadIds.has(thread.id)} onChange={() => toggleSelectThread(thread.id)} />
          </div>
          <div className="flex-1 min-w-0 pr-3">
            <div className="text-sm text-text-primary font-medium truncate">{thread.title}</div>
            <div className="text-xs text-text-tertiary font-mono mt-1">{thread.id}</div>
          </div>
          <div className="text-xs text-text-tertiary whitespace-nowrap tabular-nums">{timeAgo(thread.updatedAt)}</div>
        </div>
      )}
    >
      <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
    </SettingTable>
  );
};

export const ArchiveSection: FC<{ threads: Record<string, ChatMetadata> }> = ({ threads }) => {
  const toggleArchive = useStoreAction((s, id: string) => s.toggleArchive(id));
  const getThread = useStoreAction((s, id: string) => s.getThread(id));
  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads).filter((t) => t.archived)), [threads]);

  const [archivePage, setArchivePage] = useState(0);
  const [previewThread, setPreviewThread] = useState<ChatThread | null>(null);
  const ITEMS_PER_PAGE = 6;
  const currentArchiveItems = sortedThreads.slice(archivePage * ITEMS_PER_PAGE, (archivePage + 1) * ITEMS_PER_PAGE);

  const handlePreview = (id: string) => {
    getThread(id).then((thread) => {
      if (thread) setPreviewThread(thread);
    });
  };

  const previewMessages = useMemo(() => {
    if (!previewThread) return [];
    const { activeMessageId, messages } = previewThread;
    if (activeMessageId) return getMessagePath(previewThread, activeMessageId);
    return Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
  }, [previewThread]);

  return (
    <SettingTable
      info="View and manage your archived conversations. Archived chats are hidden from the sidebar but can be restored at any time."
      items={currentArchiveItems}
      totalItems={sortedThreads.length}
      currentPage={archivePage}
      pageSize={ITEMS_PER_PAGE}
      onPageChange={setArchivePage}
      emptyIcon="Archive"
      emptyLabel="No archived conversations."
      headerActions={
        <Button
          variant="ghost"
          onClick={() => downloadFile(JSON.stringify(threads), `yuji-archive-${new Date().toISOString().split('T')[0]}.json`, 'application/json')}
          className="badge-outline text-text-primary!"
        >
          <Icon name="Upload" size={12} />
          Export
        </Button>
      }
      renderRow={(thread) => (
        <div key={thread.id} className="settings-history-row group">
          <div className="flex-1 min-w-0 px-3">
            <div className="text-sm text-text-primary font-medium truncate">{thread.title}</div>
            <div className="text-xs text-text-tertiary mt-1">{timeAgo(thread.updatedAt)}</div>
          </div>
          <div className="flex items-center gap-2 pr-3">
            <Button variant="ghost" onClick={() => toggleArchive(thread.id)} className="badge-outline text-text-primary!" title="Unarchive">
              <Icon name="ArchiveRestore" size={12} />
              Restore
            </Button>
            <Button variant="ghost" onClick={() => handlePreview(thread.id)} className="badge-outline text-text-primary!" title="View Conversation">
              <Icon name="Maximize2" size={12} />
              View
            </Button>
          </div>
        </div>
      )}
    >
      {previewThread && (
        <FullscreenModal
          isOpen={!!previewThread}
          onClose={() => setPreviewThread(null)}
          title={previewThread.title}
          subtitle={`${timeAgo(previewThread.updatedAt)} • ${previewMessages.length} messages`}
          headerActions={
            <Button
              variant="ghost"
              onClick={() => {
                toggleArchive(previewThread.id);
                setPreviewThread(null);
              }}
              className="badge-outline text-text-primary!"
            >
              <Icon name="ArchiveRestore" size={14} />
              Restore
            </Button>
          }
          bodyClassName="bg-surface/30 overflow-y-auto"
        >
          <div className="max-w-3xl mx-auto py-4">
            {previewMessages.map((message) => (
              <ChatMessageBubble key={message.id} message={message} threadId={previewThread.id} readOnly />
            ))}
          </div>
        </FullscreenModal>
      )}
    </SettingTable>
  );
};

interface InstructionSectionProps {
  readonly instruction: Partial<Instruction>;
  readonly onChange: (updates: Partial<Instruction>) => void;
  readonly footer?: string;
}

export const InstructionSection: FC<InstructionSectionProps> = ({ instruction, onChange, footer }) => (
  <div className="space-y-2">
    <label className="settings-label">System Instruction</label>
    <InputTextarea
      value={instruction.systemPrompt || ''}
      onChange={(e) => onChange({ systemPrompt: e.target.value })}
      placeholder="Enter system instructions..."
      minRows={8}
      maxRows={8}
      debounceMs={0}
    />
    {footer && <p className="settings-footer-note">{footer}</p>}
  </div>
);

interface PersonalisationSectionProps {
  readonly personalisation: Partial<Personalisation>;
  readonly onChange: (updates: Partial<Personalisation>) => void;
}

export const PersonalisationSection: FC<PersonalisationSectionProps> = ({ personalisation, onChange }) => (
  <div className="space-y-3">
    <SettingField label="What should Yuji call you?">
      <InputText
        value={personalisation.userName || ''}
        onChange={(e) => onChange({ userName: e.target.value.slice(0, 50) })}
        placeholder="Enter your name..."
        debounceMs={0}
      />
    </SettingField>
    <SettingField label="What do you do?">
      <InputTag
        tags={personalisation.userOccupation || []}
        onChange={(userOccupation) => onChange({ userOccupation })}
        placeholder="Type a job and press Enter..."
      />
    </SettingField>
    <SettingField label="What traits should Yuji have?">
      <InputTag
        tags={personalisation.assistantTraits || []}
        onChange={(assistantTraits) => onChange({ assistantTraits })}
        placeholder="Type a trait and press Enter..."
      />
    </SettingField>
    <SettingField label="Anything else Yuji should know about you?">
      <InputTextarea
        value={personalisation.additionalContext || ''}
        onChange={(e) => onChange({ additionalContext: e.target.value.slice(0, 3000) })}
        placeholder="Interests, values, or preferences to keep in mind..."
        minRows={5}
        maxRows={5}
        debounceMs={0}
      />
    </SettingField>
  </div>
);

interface OverrideSectionProps<T> {
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: (f: { onChange: (updates: Partial<T>) => void }) => ReactNode;
  readonly onDataChange: (updates: Partial<T>) => void;
}

export const OverrideSection = <T,>({ description, checked, onChange, children, onDataChange }: OverrideSectionProps<T>) => {
  if (!checked) {
    return (
      <div className="override-empty-state">
        <Icon name="Lock" size={24} className="mb-2 opacity-50" />
        <p className="text-sm">{description}</p>
        <Button variant="ghost" onClick={() => onChange(true)} className="override-enable-btn">
          Enable Override
        </Button>
      </div>
    );
  }

  return <div className="space-y-3">{children({ onChange: onDataChange })}</div>;
};
