import { default as clsx } from 'clsx';
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
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatMessageBubble } from '@yuji/client/components/chat/ChatMessageBubble';
import { Checkbox } from '@yuji/client/components/shared/Checkbox';
import { ButtonInput, SearchInput, SelectInput, SwitchInput, TagInput, TextareaInput, TextInput } from '@yuji/client/components/shared/InputArea';
import { FullscreenModal } from '@yuji/client/components/shared/modal/FullscreenModal';
import { PickerItem } from '@yuji/client/components/shared/PickerArea';
import { getFilteredModels, getModelName } from '@yuji/client/helpers/ModelHelper';
import { getVisibleMessages, sortThreadsByDate } from '@yuji/client/helpers/ThreadHelper';
import { useChatAction, useRuntimeAction, useStoreAction } from '@yuji/client/hooks/useStore';
import { LLMProvider } from '@yuji/client/providers/LLMProvider';
import { ToolService } from '@yuji/client/services/ToolService';
import { downloadFile, formatError } from '@yuji/client/utilities/CommonUtil';
import { timeAgo } from '@yuji/client/utilities/TimeUtil';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, FC, ReactNode } from 'react';
import type {
  AppRuntimeState,
  ConfirmOptions,
  GlobalSetting,
  Instruction,
  Model,
  Personalisation,
  Thread,
  ThreadMetadata,
  ToolDefinition,
} from '@yuji/client/app/Schema';

interface DiscoverySectionProps<T> {
  readonly items: readonly T[];
  readonly emptyIcon: LucideIcon;
  readonly emptyLabel: (search: string) => string;
  readonly searchPlaceholder: string;
  readonly refreshLabel: string;
  readonly refreshTitle: string;
  readonly getId: (item: T) => string;
  readonly onRefresh: () => Promise<void>;
  readonly filterItems: (items: readonly T[], search: string) => T[];
  readonly renderRow: (item: T) => ReactNode;
}

export const DiscoverySection = <T,>({
  items,
  emptyIcon,
  emptyLabel,
  searchPlaceholder,
  refreshLabel,
  refreshTitle,
  getId,
  onRefresh,
  filterItems,
  renderRow,
}: DiscoverySectionProps<T>) => {
  const [search, setSearch] = useState('');
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'success'>('idle');

  const notifyError = useStoreAction((s, msg: string) => s.notify('error', msg));

  const handleRefresh = useCallback(async () => {
    setRefreshState('loading');
    try {
      await onRefresh();
      setRefreshState('success');
      setTimeout(() => setRefreshState('idle'), 2000);
    } catch (error) {
      setRefreshState('idle');
      notifyError(`Failed to refresh: ${formatError(error)}`);
    }
  }, [onRefresh, notifyError]);

  const filteredItems = useMemo(() => filterItems(items, search), [items, search, filterItems]);

  return (
    <SettingTable
      emptyIcon={emptyIcon}
      emptyLabel={emptyLabel(search)}
      items={filteredItems}
      getId={getId}
      size={10}
      hideCheckbox
      headerLabel={
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="settings-search-input" />
      }
      headerActions={() => (
        <ButtonInput
          className={clsx('badge-outline ml-2', refreshState === 'success' && '!text-emerald-500')}
          onClick={handleRefresh}
          disabled={refreshState === 'loading'}
          title={refreshTitle}
        >
          {refreshState === 'success' ? (
            <Check size={14} />
          ) : (
            <RefreshCw size={14} className={clsx(refreshState === 'loading' && 'animate-spin-once')} />
          )}
          <span>{refreshState === 'success' ? 'Updated' : refreshLabel}</span>
        </ButtonInput>
      )}
      renderRow={renderRow}
    />
  );
};

export const SectionWrapper: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <div className={clsx('settings-section-wrapper', className)}>{children}</div>
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
        <SelectInput
          value={settings.theme}
          onChange={(e) => onChange({ theme: e.target.value as 'dark' | 'light' })}
          className="py-2 text-xs min-w-[100px]"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </SelectInput>
      </SettingItem>

      <SettingItem label="Enter to send" description="Send the message by pressing the Enter key.">
        <SwitchInput checked={settings.enterToSend} onChange={(checked) => onChange({ enterToSend: checked })} />
      </SettingItem>

      <SettingItem label="Expand code blocks" description="Automatically expand code blocks to show full content.">
        <SwitchInput checked={settings.expandCodeblock} onChange={(checked) => onChange({ expandCodeblock: checked })} />
      </SettingItem>

      <SettingItem label="Show suggestions" description="Show prompt suggestions on the initial chat page.">
        <SwitchInput checked={settings.showSuggestions} onChange={(checked) => onChange({ showSuggestions: checked })} />
      </SettingItem>

      <SettingItem label="Save after editing" description="If disabled, the save button will be changed to regenerate.">
        <SwitchInput checked={settings.saveAfterEditing} onChange={(checked) => onChange({ saveAfterEditing: checked })} />
      </SettingItem>
    </SectionWrapper>
  );
};

export const ConnectionSection: FC<SettingSectionProps> = ({ settings, onChange }) => {
  return (
    <SectionWrapper className="space-y-3 scrollable-section">
      <SettingField label="API Provider">
        <SelectInput value="openai" disabled>
          <option value="openai">OpenAI Compatible</option>
        </SelectInput>
      </SettingField>

      <SettingField label="Base URL">
        <TextInput
          leftIcon={Link}
          value={settings.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />
      </SettingField>

      <SettingField label="API Key">
        <TextInput
          type="password"
          leftIcon={Key}
          value={settings.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </SettingField>

      <SettingField label="Tools URL">
        <TextInput
          leftIcon={Link}
          value={settings.toolsUrl || ''}
          onChange={(e) => onChange({ toolsUrl: e.target.value })}
          placeholder={settings.baseUrl}
        />
      </SettingField>
    </SectionWrapper>
  );
};

export const ModelsSection: FC<SettingSectionProps & { availableModels: readonly Model[] }> = ({ settings, availableModels, onChange }) => {
  const updateStore = useStoreAction((s, f: (state: AppRuntimeState) => AppRuntimeState) => s.update(f));
  const setAvailableModels = (models: Model[]) => updateStore((s: AppRuntimeState) => ({ ...s, availableModels: models }));

  const handleRefreshModels = useRuntimeAction(
    () =>
      Effect.gen(function* () {
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
      }),
    'Failed to fetch models',
  );

  const filterItems = useCallback(
    (items: readonly Model[], search: string) => getFilteredModels(items, settings.disabledModels, search, { includeDisabled: true, sort: true }),
    [settings.disabledModels],
  );

  const toggleModel = (modelId: string) => {
    const isDisabled = settings.disabledModels.includes(modelId);
    const newDisabledModels = isDisabled ? settings.disabledModels.filter((id) => id !== modelId) : [...settings.disabledModels, modelId];
    onChange({ disabledModels: newDisabledModels });
  };

  return (
    <DiscoverySection
      items={availableModels}
      emptyIcon={Cpu}
      emptyLabel={(search) => (search ? `No models match "${search}"` : 'No models available. Click refresh to fetch models.')}
      searchPlaceholder="Search models..."
      refreshLabel="Refresh"
      refreshTitle="Refresh Library"
      getId={(m) => m.id}
      onRefresh={handleRefreshModels}
      filterItems={filterItems}
      renderRow={(model) => {
        const isEnabled = !settings.disabledModels.includes(model.id);
        return (
          <div key={model.id} className={clsx('settings-history-row', !isEnabled && 'opacity-60')}>
            <PickerItem
              title={getModelName(availableModels, model.id)}
              description={model.id}
              icon={Cpu}
              iconColor={model.color}
              isEnabled={isEnabled}
              className="flex-1 p-1 cursor-default border-none! bg-transparent!"
              rightContent={<SwitchInput checked={isEnabled} onChange={() => toggleModel(model.id)} />}
            />
          </div>
        );
      }}
    />
  );
};

export const ToolsSection: FC<SettingSectionProps & { availableTools: readonly ToolDefinition[] }> = ({ settings, availableTools, onChange }) => {
  const updateStore = useStoreAction((s, f: (state: AppRuntimeState) => AppRuntimeState) => s.update(f));
  const setAvailableTools = (tools: ToolDefinition[]) => updateStore((s: AppRuntimeState) => ({ ...s, availableTools: tools }));

  const handleRefreshTools = useRuntimeAction(
    () =>
      Effect.gen(function* () {
        const toolService = yield* ToolService;
        const tools = yield* toolService.fetch(settings);

        setAvailableTools([...tools]);
      }),
    'Failed to fetch tools',
  );

  const filterItems = useCallback((items: readonly ToolDefinition[], search: string) => {
    if (!search) return [...items];
    const s = search.toLowerCase();
    return items.filter((t) => t.function.name.toLowerCase().includes(s) || t.function.description.toLowerCase().includes(s));
  }, []);

  const toggleTool = (toolName: string) => {
    const isDisabled = settings.disabledTools.includes(toolName);
    const newDisabledTools = isDisabled ? settings.disabledTools.filter((name) => name !== toolName) : [...settings.disabledTools, toolName];
    onChange({ disabledTools: newDisabledTools });
  };

  return (
    <DiscoverySection
      items={availableTools}
      emptyIcon={Wrench}
      emptyLabel={(search) => (search ? `No tools match "${search}"` : 'No tools available. Click refresh to fetch tools.')}
      searchPlaceholder="Search tools..."
      refreshLabel="Refresh"
      refreshTitle="Refresh Tools"
      getId={(t) => t.function.name}
      onRefresh={handleRefreshTools}
      filterItems={filterItems}
      renderRow={(tool) => {
        const isEnabled = !settings.disabledTools.includes(tool.function.name);
        return (
          <div key={tool.function.name} className={clsx('settings-history-row', !isEnabled && 'opacity-60')}>
            <PickerItem
              title={tool.function.name}
              description={tool.function.description}
              icon={Wrench}
              isEnabled={isEnabled}
              className="flex-1 p-1 cursor-default border-none! bg-transparent!"
              rightContent={<SwitchInput checked={isEnabled} onChange={() => toggleTool(tool.function.name)} />}
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
    if (totalPages === 0) {
      return setCurrentPage(0);
    }

    if (currentPage >= totalPages) {
      setCurrentPage(totalPages - 1);
    }
  }, [items.length, totalPages, currentPage]);

  const currentItems = useMemo(() => items.slice(currentPage * size, (currentPage + 1) * size), [items, currentPage, size]);

  const toggleSelectAll = () => {
    if (!getId) {
      return;
    }

    const allSelected = currentItems.length > 0 && currentItems.every((item) => selectedIds.has(getId(item)));

    if (allSelected) {
      const next = new Set(selectedIds);
      currentItems.forEach((item) => next.delete(getId(item)));
      setSelectedIds(next);
      return;
    }

    const next = new Set(selectedIds);
    currentItems.forEach((item) => next.add(getId(item)));
    setSelectedIds(next);
  };

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
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
            <div className="settings-table-empty">
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
            <ButtonInput
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              variant="secondary"
              className="px-3! py-2! text-xs! font-medium!"
            >
              <ChevronLeft size={12} />
              Prev
            </ButtonInput>
            <ButtonInput
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              variant="secondary"
              className="px-3! py-2! text-xs! font-medium!"
            >
              Next
              <ChevronRight size={12} />
            </ButtonInput>
          </div>
        </div>
      )}
    </SectionWrapper>
  );
};

const useExportThreads = (prefix: string, getAllIds: () => string[], errorPrefix: string) => {
  const getThread = useStoreAction((s, id: string) => s.getThread(id));

  return useRuntimeAction(
    (selectedIds: Set<string>) =>
      Effect.gen(function* () {
        const ids = selectedIds.size > 0 ? Array.from(selectedIds) : getAllIds();
        const dataToExport: Record<string, Thread> = {};

        for (const id of ids) {
          const thread = yield* Effect.promise(() => getThread(id));
          if (thread) dataToExport[id] = thread;
        }

        downloadFile(JSON.stringify(dataToExport), `yuji-${prefix}-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      }),
    errorPrefix,
  );
};

const useDeleteSelectedThreads = (title: string, getConfirmMessage: (count: number) => string) => {
  const showConfirm = useStoreAction((s, config: ConfirmOptions) => s.setConfirm(config));
  const onDeleteThreads = useChatAction((c, ids: Set<string>) => c.deleteThreads(ids));

  return (selectedIds: Set<string>, resetSelection: () => void) => {
    if (selectedIds.size === 0) return;
    showConfirm({
      title,
      message: getConfirmMessage(selectedIds.size),
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        onDeleteThreads(new Set(selectedIds));
        resetSelection();
      },
    });
  };
};

export const HistorySection: FC<{ threads: Record<string, ThreadMetadata> }> = ({ threads }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImportThreads = useChatAction((c, newThreads: Record<string, Thread>) => c.importThreads(newThreads));

  const handleExport = useExportThreads('history', () => Object.keys(threads), 'Failed to export history');

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (!result) {
          return;
        }

        const json = JSON.parse(result as string);
        const isValidImport = typeof json === 'object' && json !== null;

        if (isValidImport) {
          onImportThreads(json);
        }
      } catch (err) {
        console.error('Failed to parse history file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSelected = useDeleteSelectedThreads(
    'Delete History',
    (count) => `Are you sure you want to delete **${count}** selected thread${count > 1 ? 's' : ''}? This action cannot be undone.`,
  );

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
            <ButtonInput onClick={() => handleDeleteSelected(selectedIds, resetSelection)} className="badge-outline danger">
              <Trash2 size={12} />
              Delete ({selectedIds.size})
            </ButtonInput>
          )}
          <ButtonInput onClick={() => handleExport(selectedIds)} className="badge-outline" disabled={sortedThreads.length === 0}>
            <Upload size={12} />
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </ButtonInput>
          <ButtonInput onClick={() => fileInputRef.current?.click()} className="badge-outline">
            <Download size={12} />
            Import
          </ButtonInput>
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

  const handleExport = useExportThreads(
    'archive',
    () =>
      Object.values(threads)
        .filter((t) => t.archived)
        .map((t) => t.id),
    'Failed to export archive',
  );

  const sortedThreads = useMemo(() => sortThreadsByDate(Object.values(threads).filter((t) => t.archived)), [threads]);

  const [previewThread, setPreviewThread] = useState<Thread | null>(null);

  const handleDeleteSelected = useDeleteSelectedThreads(
    'Delete Archived History',
    (count) => `Are you sure you want to delete **${count}** selected archived thread${count > 1 ? 's' : ''}? This action cannot be undone.`,
  );

  const handlePreview = (id: string) => {
    getThread(id).then((thread) => {
      if (!thread) {
        return;
      }

      setPreviewThread(thread);
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
            <ButtonInput onClick={() => handleDeleteSelected(selectedIds, resetSelection)} className="badge-outline danger">
              <Trash2 size={12} />
              Delete ({selectedIds.size})
            </ButtonInput>
          )}
          <ButtonInput onClick={() => handleExport(selectedIds)} className="badge-outline" disabled={sortedThreads.length === 0}>
            <Upload size={12} />
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </ButtonInput>
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
            <ButtonInput onClick={() => toggleArchive(thread.id)} className="badge-outline" title="Unarchive">
              <ArchiveRestore size={12} />
              Restore
            </ButtonInput>
            <ButtonInput onClick={() => handlePreview(thread.id)} className="badge-outline" title="View Conversation">
              <Maximize2 size={12} />
              View
            </ButtonInput>
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
            <ButtonInput
              onClick={() => {
                toggleArchive(previewThread.id);
                setPreviewThread(null);
              }}
              className="badge-outline"
            >
              <ArchiveRestore size={14} />
              Restore
            </ButtonInput>
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
    <TextareaInput
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
      <TextInput
        value={personalisation.userName || ''}
        onChange={(e) => onChange({ userName: e.target.value.slice(0, 50) })}
        placeholder="Enter your name..."
        debounceMs={0}
      />
    </SettingField>
    <SettingField label="What do you do?">
      <TagInput
        tags={personalisation.userOccupation || []}
        onChange={(userOccupation) => onChange({ userOccupation })}
        placeholder="Type a job and press Enter..."
      />
    </SettingField>
    <SettingField label="What traits should Yuji have?">
      <TagInput
        tags={personalisation.assistantTraits || []}
        onChange={(assistantTraits) => onChange({ assistantTraits })}
        placeholder="Type a trait and press Enter..."
      />
    </SettingField>
    <SettingField label="Anything else Yuji should know about you?">
      <TextareaInput
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
        <ButtonInput onClick={() => onChange(true)} className="override-enable-btn">
          Enable Override
        </ButtonInput>
      </div>
    );
  }

  return <div className="space-y-3">{children({ onChange: onDataChange })}</div>;
};
