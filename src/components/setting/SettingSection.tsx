import clsx from 'clsx';
import { Effect } from 'effect';
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  Inbox,
  Key,
  Link,
  Lock,
  Maximize2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { YujiRuntime } from '../../app/Runtime';
import { getFilteredModels, getModelId } from '../../helpers/ModelHelper';
import { getVisibleMessages, sortThreadsByDate } from '../../helpers/ThreadHelper';
import { useChatAction, useStoreAction } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { StoreService } from '../../services/StoreService';
import { downloadFile, formatError } from '../../utilities/CommonUtil';
import { timeAgo } from '../../utilities/TimeUtil';
import { ChatMessageBubble } from '../chat/ChatMessageBubble';
import { Checkbox } from '../shared/Checkbox';
import { InputButton, InputSearch, InputSelect, InputSwitch, InputTag, InputText, InputTextarea } from '../shared/InputArea';
import { FullscreenModal } from '../shared/modal/FullscreenModal';
import { ModelItem } from '../shared/ModelItem';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, FC, ReactNode } from 'react';
import type { AppRuntimeState, ConfirmOptions, GlobalSetting, Instruction, Model, Personalisation, Thread, ThreadMetadata } from '../../app/Schema';

export const SectionWrapper: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('flex flex-col min-h-0 h-full', className)}>{children}</div>
);

export const SettingItem: FC<{ label: string; description?: string; children: ReactNode; className?: string }> = ({
  label,
  description,
  children,
  className,
}) => (
  <div className={clsx('panel-section flex-between', className)}>
    <div className="flex-1 min-w-0">
      <div className="text-sm text-text-primary">{label}</div>
      {description && <div className="text-xs text-text-tertiary">{description}</div>}
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
  readonly settings: GlobalSetting;
  readonly onChange: (updates: Partial<GlobalSetting> | ((s: GlobalSetting) => GlobalSetting)) => void;
}

export const GeneralSection: FC<SettingSectionProps> = ({ settings, onChange }) => {
  return (
    <SectionWrapper className="scrollable-section">
      <SettingItem label="Appearance">
        <InputSelect
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as 'dark' | 'light' })}
          className="py-2 text-xs min-w-[100px]"
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
    <SectionWrapper className="space-y-3 scrollable-section">
      <SettingField label="API Provider">
        <InputSelect value="openai" disabled>
          <option value="openai">OpenAI Compatible</option>
        </InputSelect>
      </SettingField>

      <SettingField label="Base URL">
        <InputText
          leftIcon={Link}
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />
      </SettingField>

      <SettingField label="API Key">
        <InputText
          type="password"
          leftIcon={Key}
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </SettingField>
    </SectionWrapper>
  );
};

export const ModelsSection: FC<SettingSectionProps & { availableModels: readonly Model[] }> = ({ settings, availableModels, onChange }) => {
  const [modelSearch, setModelSearch] = useState('');
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'success'>('idle');

  const updateStore = useStoreAction((s, f: (state: AppRuntimeState) => AppRuntimeState) => s.update(f));
  const setAvailableModels = (models: Model[]) => updateStore((s: AppRuntimeState) => ({ ...s, availableModels: models }));

  const handleRefreshModels = useCallback(() => {
    YujiRuntime.runPromise(
      Effect.gen(function* () {
        setRefreshState('loading');
        const llm = yield* LLMProvider;
        const result = yield* llm.fetchModels(settings);

        const apiModels = result.data.map(
          (m) =>
            ({
              id: m.id,
              name: m.id,
              icon: 'Cpu',
              color: 'text-text-tertiary',
            }) satisfies Model,
        );

        setAvailableModels(apiModels);
        setRefreshState('success');
        setTimeout(() => setRefreshState('idle'), 2000);
      }).pipe(
        Effect.catchAll((e) => {
          setRefreshState('idle');
          return Effect.flatMap(StoreService, (s) => s.notify('error', `Failed to fetch models: ${formatError(e)}`));
        }),
      ),
    ).catch(() => {});
  }, [settings]);

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
    <SettingTable
      emptyIcon={Cpu}
      emptyLabel={modelSearch ? `No models match "${modelSearch}"` : 'No models available. Click refresh to fetch models.'}
      items={filteredModels}
      getId={(m) => m.id}
      size={10}
      hideCheckbox
      headerLabel={
        <InputSearch
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          placeholder="Search models..."
          className="input-sm bg-primary/10 hover:bg-surface focus:bg-surface mr-2"
        />
      }
      headerActions={() => (
        <InputButton
          className={clsx('badge-outline', refreshState === 'success' && '!text-emerald-500')}
          onClick={handleRefreshModels}
          disabled={refreshState === 'loading'}
          title="Refresh Library"
        >
          {refreshState === 'success' ? (
            <Check size={14} />
          ) : (
            <RefreshCw size={14} className={clsx(refreshState === 'loading' && 'animate-spin-once')} />
          )}
          <span>{refreshState === 'success' ? 'Updated' : 'Refresh'}</span>
        </InputButton>
      )}
      renderRow={(model) => {
        const isEnabled = !settings.disabledModels.includes(model.id);
        return (
          <div key={model.id} className={clsx('settings-history-row', !isEnabled && 'opacity-60')}>
            <ModelItem
              model={model}
              availableModels={availableModels}
              isEnabled={isEnabled}
              isDefault={effectiveModelId === model.id}
              className="flex-1 p-1 cursor-default border-none! bg-transparent!"
              rightContent={<InputSwitch checked={isEnabled} onChange={() => toggleModel(model.id)} />}
            />
          </div>
        );
      }}
    />
  );
};

interface SettingTableProps<T> {
  readonly info?: string;
  readonly emptyIcon: LucideIcon;
  readonly emptyLabel: string;
  readonly items: T[];
  readonly size?: number;
  readonly getId: (item: T) => string;
  readonly headerLabel?: ReactNode;
  readonly headerActions?: (selectedIds: Set<string>, resetSelection: () => void) => ReactNode;
  readonly renderRow: (item: T, index: number, selectionProps?: { checked: boolean; onChange: () => void }) => ReactNode;
  readonly hideCheckbox?: boolean;
  readonly children?: ReactNode;
}

export const SettingTable = <T,>({
  info,
  emptyIcon: EmptyIcon,
  emptyLabel,
  items,
  size = 6,
  getId,
  headerLabel = 'Title',
  headerActions,
  renderRow,
  hideCheckbox,
  children,
}: SettingTableProps<T>) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset page if it's out of bounds after items change
  const totalPages = Math.ceil(items.length / size);
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    } else if (totalPages === 0) {
      setCurrentPage(0);
    }
  }, [items.length, totalPages, currentPage]);

  const currentItems = useMemo(() => items.slice(currentPage * size, (currentPage + 1) * size), [items, currentPage, size]);

  const toggleSelectAll = () => {
    if (!getId) return;
    if (currentItems.length > 0 && currentItems.every((item) => selectedIds.has(getId(item)))) {
      const next = new Set(selectedIds);
      currentItems.forEach((item) => next.delete(getId(item)));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      currentItems.forEach((item) => next.add(getId(item)));
      setSelectedIds(next);
    }
  };

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const resetSelection = () => setSelectedIds(new Set());

  return (
    <SectionWrapper className="space-y-3">
      {children}
      {info && (
        <div className="flex flex-col gap-3 flex-shrink-0">
          <p className="settings-info-box">{info}</p>
        </div>
      )}

      <div className="settings-history-table">
        <div className="settings-history-header">
          {!hideCheckbox && (
            <div className="settings-history-checkbox-col">
              <Checkbox
                checked={currentItems.length > 0 && currentItems.every((s) => selectedIds.has(getId(s)))}
                indeterminate={
                  currentItems.length > 0 &&
                  !currentItems.every((s) => selectedIds.has(getId(s))) &&
                  currentItems.some((s) => selectedIds.has(getId(s)))
                }
                onChange={toggleSelectAll}
              />
            </div>
          )}
          <div className="flex-1 label-caps !text-text-primary">{headerLabel}</div>
          <div className="flex items-center gap-2">{headerActions?.(selectedIds, resetSelection)}</div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-separator">
          {currentItems.length > 0 ? (
            currentItems.map((item, index) => {
              const id = getId(item);
              return renderRow(
                item,
                index,
                hideCheckbox
                  ? undefined
                  : {
                      checked: selectedIds.has(id),
                      onChange: () => toggleSelectItem(id),
                    },
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2 min-h-[200px]">
              <EmptyIcon size={32} className="opacity-20" />
              <p className="text-sm">{emptyLabel}</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex-between flex-shrink-0">
          <div className="text-xs text-text-tertiary">
            Page {currentPage + 1} of {totalPages}
          </div>
          <div className="flex gap-2">
            <InputButton
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              variant="secondary"
              className="px-3! py-2! text-xs! font-medium!"
            >
              <ChevronLeft size={12} />
              Prev
            </InputButton>
            <InputButton
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              variant="secondary"
              className="px-3! py-2! text-xs! font-medium!"
            >
              Next
              <ChevronRight size={12} />
            </InputButton>
          </div>
        </div>
      )}
    </SectionWrapper>
  );
};

const exportThreads = (threads: Record<string, ThreadMetadata>, selectedIds: Set<string>, prefix: string) => {
  let dataToExport = threads;
  if (selectedIds.size > 0) {
    dataToExport = Object.fromEntries(Object.entries(threads).filter(([id]) => selectedIds.has(id)));
  }
  downloadFile(JSON.stringify(dataToExport), `yuji-${prefix}-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
};

export const HistorySection: FC<{ threads: Record<string, ThreadMetadata> }> = ({ threads }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));
  const onImportThreads = useChatAction((c, newThreads: Record<string, Thread>) => c.importThreads(newThreads));
  const onDeleteThreads = useChatAction((c, ids: Set<string>) => c.deleteThreads(ids));

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          onImportThreads(json);
        }
      } catch (err) {
        console.error('Failed to parse history file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSelected = (selectedIds: Set<string>, resetSelection: () => void) => {
    if (selectedIds.size === 0) return;
    showConfirm({
      title: 'Delete History',
      message: `Are you sure you want to delete **${selectedIds.size}** selected thread${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        onDeleteThreads(new Set(selectedIds));
        resetSelection();
      },
    });
  };

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads).filter((t) => !t.archived)), [threads]);

  return (
    <SettingTable
      info="Back up your conversation history or migrate it to another device. Importing data will merge with your existing conversations."
      emptyIcon={Inbox}
      emptyLabel="No chat history available."
      items={sortedThreads}
      getId={(t) => t.id}
      headerActions={(selectedIds, resetSelection) => (
        <>
          {selectedIds.size > 0 && (
            <InputButton onClick={() => handleDeleteSelected(selectedIds, resetSelection)} className="badge-outline danger">
              <Trash2 size={12} />
              Delete ({selectedIds.size})
            </InputButton>
          )}
          <InputButton onClick={() => exportThreads(threads, selectedIds, 'history')} className="badge-outline">
            <Upload size={12} />
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </InputButton>
          <InputButton onClick={() => fileInputRef.current?.click()} className="badge-outline">
            <Download size={12} />
            Import
          </InputButton>
        </>
      )}
      renderRow={(thread, _, selection) => (
        <div key={thread.id} className={clsx('settings-history-row', selection?.checked && 'settings-history-row-active')}>
          {selection && (
            <div className="settings-history-checkbox-col">
              <Checkbox checked={selection.checked} onChange={selection.onChange} />
            </div>
          )}
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

export const ArchiveSection: FC<{ threads: Record<string, ThreadMetadata> }> = ({ threads }) => {
  const toggleArchive = useStoreAction((s, id: string) => s.toggleArchive(id));
  const getThread = useStoreAction((s, id: string) => s.getThread(id));
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));

  const onDeleteThreads = useChatAction((c, ids: Set<string>) => c.deleteThreads(ids));

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads).filter((t) => t.archived)), [threads]);

  const [previewThread, setPreviewThread] = useState<Thread | null>(null);

  const handleDeleteSelected = (selectedIds: Set<string>, resetSelection: () => void) => {
    if (selectedIds.size === 0) return;
    showConfirm({
      title: 'Delete Archived History',
      message: `Are you sure you want to delete **${selectedIds.size}** selected archived thread${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        onDeleteThreads(new Set(selectedIds));
        resetSelection();
      },
    });
  };

  const handlePreview = (id: string) => {
    getThread(id).then((thread) => {
      if (thread) setPreviewThread(thread);
    });
  };

  const previewMessages = useMemo(() => (previewThread ? getVisibleMessages(previewThread) : []), [previewThread]);

  return (
    <SettingTable
      info="View and manage your archived conversations. Archived chats are hidden from the sidebar but can be restored at any time."
      emptyIcon={Archive}
      emptyLabel="No archived conversations."
      items={sortedThreads}
      getId={(t) => t.id}
      headerActions={(selectedIds, resetSelection) => (
        <>
          {selectedIds.size > 0 && (
            <InputButton onClick={() => handleDeleteSelected(selectedIds, resetSelection)} className="badge-outline danger">
              <Trash2 size={12} />
              Delete ({selectedIds.size})
            </InputButton>
          )}
          <InputButton onClick={() => exportThreads(threads, selectedIds, 'archive')} className="badge-outline">
            <Upload size={12} />
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </InputButton>
        </>
      )}
      renderRow={(thread, _, selection) => (
        <div key={thread.id} className={clsx('settings-history-row', selection?.checked && 'settings-history-row-active')}>
          {selection && (
            <div className="settings-history-checkbox-col">
              <Checkbox checked={selection.checked} onChange={selection.onChange} />
            </div>
          )}
          <div className="flex-1 min-w-0 pr-3">
            <div className="text-sm text-text-primary font-medium truncate">{thread.title}</div>
            <div className="text-xs text-text-tertiary mt-1">{timeAgo(thread.updatedAt)}</div>
          </div>
          <div className="flex items-center gap-2">
            <InputButton onClick={() => toggleArchive(thread.id)} className="badge-outline" title="Unarchive">
              <ArchiveRestore size={12} />
              Restore
            </InputButton>
            <InputButton onClick={() => handlePreview(thread.id)} className="badge-outline" title="View Conversation">
              <Maximize2 size={12} />
              View
            </InputButton>
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
            <InputButton
              onClick={() => {
                toggleArchive(previewThread.id);
                setPreviewThread(null);
              }}
              className="badge-outline"
            >
              <ArchiveRestore size={14} />
              Restore
            </InputButton>
          }
          bodyClassName="bg-surface/30 overflow-y-auto"
        >
          <div className="max-w-3xl mx-auto">
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
        <Lock size={24} className="mb-2 opacity-50" />
        <p className="text-sm">{description}</p>
        <InputButton onClick={() => onChange(true)} className="override-enable-btn">
          Enable Override
        </InputButton>
      </div>
    );
  }

  return <div className="space-y-3">{children({ onChange: onDataChange })}</div>;
};
