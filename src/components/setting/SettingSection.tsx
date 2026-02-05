import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { Model } from '../../app/Schema';
import { getModelId } from '../../helpers/ModelHelper';
import { useConfirm, useStoreEffect, useUpdateSetting, useUpdateStore } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { toTitleCase } from '../../utilities/CommonUtil';
import { timeAgo } from '../../utilities/TimeUtil';
import { Icon } from '../shared/Icon';
import { InputSearch, InputSelect, InputSwitch, InputTag, InputText, InputTextarea } from '../shared/InputArea';

import type { ChangeEvent, FC, ReactNode } from 'react';
import type { ChatSession, Instruction, Personalisation, Settings } from '../../app/Schema';

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

export const GeneralSection: FC<{ settings: Settings }> = ({ settings }) => {
  const updateSetting = useUpdateSetting();
  return (
    <SectionWrapper>
      <SettingItem label="Appearance">
        <InputSelect
          value={settings.theme}
          onChange={(e) => updateSetting({ theme: e.target.value as 'dark' | 'light' })}
          className="!py-1.5 !text-xs min-w-[100px]"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </InputSelect>
      </SettingItem>

      <SettingItem label="Enter to send" description="Send the message by pressing the Enter key.">
        <InputSwitch checked={settings.enterToSend} onChange={(checked) => updateSetting({ enterToSend: checked })} />
      </SettingItem>

      <SettingItem label="Expand code blocks" description="Automatically expand code blocks to show full content.">
        <InputSwitch checked={settings.expandCodeblock} onChange={(checked) => updateSetting({ expandCodeblock: checked })} />
      </SettingItem>

      <SettingItem label="Show suggestions" description="Show prompt suggestions on the initial chat page.">
        <InputSwitch checked={settings.showSuggestions} onChange={(checked) => updateSetting({ showSuggestions: checked })} />
      </SettingItem>
    </SectionWrapper>
  );
};

export const ConnectionSection: FC<{ settings: Settings }> = ({ settings }) => {
  const updateSetting = useUpdateSetting();
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
          onChange={(e) => updateSetting({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />
      </SettingField>

      <SettingField label="API Key">
        <InputText
          type="password"
          leftIcon="Key"
          value={settings.apiKey}
          onChange={(e) => updateSetting({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </SettingField>
    </SectionWrapper>
  );
};

export const ModelsSection: FC<{ settings: Settings; availableModels: ReadonlyArray<Model> }> = ({ settings, availableModels }) => {
  const updateStore = useUpdateStore();
  const updateSetting = useUpdateSetting();
  const [modelSearch, setModelSearch] = useState('');

  const setAvailableModels = (models: ReadonlyArray<Model>) => updateStore((s) => ({ ...s, availableModels: models }));

  const handleRefreshModels = useStoreEffect(() =>
    Effect.gen(function* () {
      const llm = yield* LLMProvider;
      const result = yield* llm.fetchModels(settings);

      const apiModels: ReadonlyArray<Model> = result.data.map((m) =>
        Model({
          id: m.id,
          name: m.id,
          description: `Fetched from ${settings.baseUrl}`,
          provider: 'OpenAI Compatible',
          icon: 'Cpu',
          color: 'text-text-tertiary',
          tags: ['API'],
          isNew: false,
          premium: false,
        }),
      );

      const staticIds = new Set(availableModels.map((m) => m.id));
      const newModels = apiModels.filter((m) => !staticIds.has(m.id));

      setAvailableModels([...availableModels, ...newModels]);
    }),
  );

  const filteredModels = useMemo(() => {
    const query = modelSearch.toLowerCase();
    return availableModels
      .filter((m: Model) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query))
      .sort((a, b) => {
        const aDisabled = settings.disabledModels.includes(a.id) ? 1 : 0;
        const bDisabled = settings.disabledModels.includes(b.id) ? 1 : 0;
        return aDisabled - bDisabled;
      });
  }, [availableModels, modelSearch, settings.disabledModels]);

  const toggleModel = (modelId: string) => {
    const isDisabled = settings.disabledModels.includes(modelId);
    const newDisabledModels = isDisabled ? settings.disabledModels.filter((id) => id !== modelId) : [...settings.disabledModels, modelId];
    updateSetting({ disabledModels: newDisabledModels });
  };

  const effectiveModelId = getModelId(settings, availableModels);

  return (
    <SectionWrapper className="space-y-3">
      <div className="flex-shrink-0 flex gap-2">
        <div className="flex-1">
          <InputSearch value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models..." />
        </div>
        <button onClick={handleRefreshModels} className="badge-outline whitespace-nowrap" title="Refresh Library">
          <Icon name="RefreshCw" size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 space-y-2">
        {filteredModels.length > 0 ? (
          filteredModels.map((model: Model) => {
            const isEnabled = !settings.disabledModels.includes(model.id);
            return (
              <div key={model.id} className={clsx('settings-model-card', isEnabled ? 'enabled' : 'disabled')}>
                <div className={clsx('settings-model-icon-wrapper', isEnabled ? model.color || 'text-text-tertiary' : 'disabled')}>
                  <Icon name={model.icon} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('text-semibold text-sm', isEnabled ? 'text-text-primary' : 'text-text-tertiary')}>
                      {toTitleCase(model.name)}
                    </span>
                    {effectiveModelId === model.id && isEnabled && <div className="badge-primary">Default</div>}
                    {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                  </div>
                  <div className="text-xs text-text-tertiary font-mono">{model.id}</div>
                  {model.description && <p className="text-xs text-text-tertiary line-clamp-1 mt-1">{model.description}</p>}
                </div>

                <InputSwitch checked={isEnabled} onChange={() => toggleModel(model.id)} />
              </div>
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

export const HistorySection: FC<{ sessions: Record<string, ChatSession> }> = ({ sessions }) => {
  const updateStore = useUpdateStore();
  const setConfirm = useConfirm();
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 6;

  const importSessions = (newSessions: Record<string, ChatSession>) => updateStore((s) => ({ ...s, sessions: { ...s.sessions, ...newSessions } }));

  const deleteSessions = (ids: Set<string>) =>
    updateStore((s) => {
      const nextSessions = { ...s.sessions };
      ids.forEach((id) => delete nextSessions[id]);
      return {
        ...s,
        sessions: nextSessions,
        activeSessionId: ids.has(s.activeSessionId || '') ? null : s.activeSessionId,
      };
    });

  const handleExport = () => {
    let dataToExport = sessions;
    if (selectedSessionIds.size > 0) {
      dataToExport = Object.fromEntries(Object.entries(sessions).filter(([id]) => selectedSessionIds.has(id)));
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dataToExport));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `yuji-history-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          importSessions(json);
        }
      } catch (err) {
        console.error('Failed to parse history file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSelected = () => {
    if (selectedSessionIds.size === 0) return;
    setConfirm({
      title: 'Delete History',
      message: `Are you sure you want to delete **${selectedSessionIds.size}** selected session${selectedSessionIds.size > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        deleteSessions(selectedSessionIds);
        setSelectedSessionIds(new Set());
      },
    });
  };

  const sortedSessions = (Object.values(sessions) as ChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
  const totalHistoryPages = Math.ceil(sortedSessions.length / ITEMS_PER_PAGE);
  const currentHistoryItems = sortedSessions.slice(historyPage * ITEMS_PER_PAGE, (historyPage + 1) * ITEMS_PER_PAGE);

  const toggleSelectAll = () => {
    if (selectedSessionIds.size === currentHistoryItems.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(currentHistoryItems.map((s) => s.id)));
    }
  };

  const toggleSelectSession = (id: string) => {
    const next = new Set(selectedSessionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSessionIds(next);
  };

  return (
    <SectionWrapper className="space-y-3">
      <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
      <div className="flex flex-col gap-3 flex-shrink-0">
        <p className="settings-info-box">
          Back up your conversation history or migrate it to another device. Importing data will merge with your existing conversations.
        </p>
      </div>
      <div className="settings-history-table">
        <div className="settings-history-header">
          <div className="settings-history-checkbox-col">
            <button
              onClick={toggleSelectAll}
              className={clsx(
                'checkbox-base',
                currentHistoryItems.length > 0 && currentHistoryItems.some((s) => selectedSessionIds.has(s.id)) && 'checked',
              )}
            >
              {currentHistoryItems.length > 0 && currentHistoryItems.every((s) => selectedSessionIds.has(s.id)) ? (
                <Icon name="Check" size={12} strokeWidth={4} />
              ) : (
                <Icon name="Minus" size={12} strokeWidth={4} />
              )}
            </button>
          </div>
          <div className="flex-1 label-caps text-text-primary">Title</div>
          <div className="flex items-center gap-2">
            {selectedSessionIds.size > 0 && (
              <button onClick={handleDeleteSelected} className="badge-outline !bg-danger/10 !text-danger border-danger/20">
                <Icon name="Trash2" size={12} />
                Delete ({selectedSessionIds.size})
              </button>
            )}
            <button onClick={handleExport} className="badge-outline !text-text-tertiary">
              <Icon name="Upload" size={12} />
              Export {selectedSessionIds.size > 0 ? `(${selectedSessionIds.size})` : ''}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="badge-outline !text-text-tertiary">
              <Icon name="Download" size={12} />
              Import
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-separator">
          {currentHistoryItems.length > 0 ? (
            currentHistoryItems.map((session) => (
              <div key={session.id} className={clsx('settings-history-row', selectedSessionIds.has(session.id) && 'settings-history-row-active')}>
                <div className="settings-history-checkbox-col">
                  <button
                    onClick={() => toggleSelectSession(session.id)}
                    className={clsx('checkbox-base', selectedSessionIds.has(session.id) && 'checked')}
                  >
                    <Icon name="Check" size={12} strokeWidth={4} />
                  </button>
                </div>
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-sm text-text-primary font-medium truncate">{session.title}</div>
                  <div className="text-xs text-text-tertiary font-mono mt-1">{session.id}</div>
                </div>
                <div className="text-xs text-text-tertiary whitespace-nowrap tabular-nums">{timeAgo(session.updatedAt)}</div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
              <Icon name="Inbox" size={32} className="opacity-20" />
              <p className="text-sm">No chat history available.</p>
            </div>
          )}
        </div>
      </div>

      {totalHistoryPages > 1 && (
        <div className="flex-between pt-2 flex-shrink-0">
          <div className="text-xs text-text-tertiary">
            Page {historyPage + 1} of {totalHistoryPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              disabled={historyPage === 0}
              className="flex-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Icon name="ChevronLeft" size={12} />
              Prev
            </button>
            <button
              onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
              disabled={historyPage >= totalHistoryPages - 1}
              className="flex-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <Icon name="ChevronRight" size={12} />
            </button>
          </div>
        </div>
      )}
    </SectionWrapper>
  );
};

interface InstructionSectionProps {
  readonly instruction: Partial<Instruction>;
  readonly onChange: (updates: Partial<Instruction>) => void;
  readonly footer?: string;
}

export const InstructionSection: FC<InstructionSectionProps> = ({ instruction, onChange, footer }) => (
  <SectionWrapper className="space-y-3">
    <SettingField label="System Instruction">
      <InputTextarea
        value={instruction.systemPrompt || ''}
        onChange={(e) => onChange({ systemPrompt: e.target.value })}
        placeholder="Enter system instructions..."
        minRows={8}
        maxRows={8}
      />
      {footer && <p className="settings-footer-note">{footer}</p>}
    </SettingField>
  </SectionWrapper>
);

interface PersonalisationSectionProps {
  readonly personalisation: Partial<Personalisation>;
  readonly onChange: (updates: Partial<Personalisation>) => void;
}

export const PersonalisationSection: FC<PersonalisationSectionProps> = ({ personalisation, onChange }) => (
  <SectionWrapper className="space-y-3">
    <SettingField label="What should Yuji call you?">
      <InputText
        value={personalisation.userName || ''}
        onChange={(e) => onChange({ userName: e.target.value.slice(0, 50) })}
        placeholder="Enter your name..."
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
  </SectionWrapper>
);

interface OverrideSectionProps {
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children?: ReactNode;
}

export const OverrideSection: FC<OverrideSectionProps> = ({ description, checked, onChange, children }) => {
  if (!checked) {
    return (
      <div className="override-empty-state">
        <Icon name="Lock" size={24} className="mb-2 opacity-50" />
        <p className="text-sm">{description}</p>
        <button onClick={() => onChange(true)} className="override-enable-btn">
          Enable Override
        </button>
      </div>
    );
  }

  return <div className="space-y-3 animate-fade-in">{children}</div>;
};
