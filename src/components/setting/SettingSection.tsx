import clsx from 'clsx';
import { Effect } from 'effect';
import { useMemo, useRef, useState } from 'react';

import { Model } from '../../app/Schema';
import { getModelId } from '../../helpers/ModelHelper';
import { useAction, useConfirm, useUpdateSetting, useUpdateStore } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { toTitleCase } from '../../utilities/CommonUtil';
import { timeAgo } from '../../utilities/TimeUtil';
import { Icon } from '../shared/Icon';
import { InputSearch, InputSelect, InputSwitch, InputText, InputTextarea } from '../shared/InputArea';

import type { ChangeEvent, FC, ReactNode } from 'react';
import type { ChatSession, Instruction, Personalisation, Settings } from '../../app/Schema';

export const GeneralSection: FC<{ settings: Settings }> = ({ settings }) => {
  const updateSetting = useUpdateSetting();
  return (
    <div className="animate-fade-in flex flex-col h-full overflow-y-auto pr-2">
      <div className="panel-section flex items-center justify-between">
        <div className="text-sm text-text-primary">Appearance</div>
        <button className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
          Dark
          <Icon name="ChevronDown" size={16} />
        </button>
      </div>

      <div className="panel-section flex items-center justify-between">
        <div className="text-sm text-text-primary">Enter to send</div>
        <InputSwitch checked={settings.enterToSend} onChange={(checked) => updateSetting({ enterToSend: checked })} />
      </div>

      <div className="panel-section flex items-center justify-between">
        <div className="text-sm text-text-primary">Expand code blocks</div>
        <InputSwitch checked={settings.expandCodeblock} onChange={(checked) => updateSetting({ expandCodeblock: checked })} />
      </div>
    </div>
  );
};

export const ConnectionSection: FC<{ settings: Settings }> = ({ settings }) => {
  const updateSetting = useUpdateSetting();
  return (
    <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
      <div className="space-y-2">
        <label className="settings-label">API Provider</label>
        <InputSelect value="openai" disabled>
          <option value="openai">OpenAI Compatible</option>
        </InputSelect>
      </div>

      <div className="space-y-2">
        <label className="settings-label">Base URL</label>
        <InputText
          leftIcon="Link"
          value={settings.baseUrl}
          onChange={(e) => updateSetting({ baseUrl: e.target.value })}
          placeholder="http://localhost:11434/v1"
        />
      </div>

      <div className="space-y-2">
        <label className="settings-label">API Key</label>
        <InputText
          type="password"
          leftIcon="Key"
          value={settings.apiKey}
          onChange={(e) => updateSetting({ apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </div>
    </div>
  );
};

export const ModelsSection: FC<{ settings: Settings; availableModels: ReadonlyArray<Model> }> = ({ settings, availableModels }) => {
  const updateStore = useUpdateStore();
  const updateSetting = useUpdateSetting();
  const [modelSearch, setModelSearch] = useState('');

  const setAvailableModels = (models: ReadonlyArray<Model>) => updateStore((s) => ({ ...s, availableModels: models }));

  const handleRefreshModels = useAction(() =>
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
          color: 'text-text-secondary',
          tags: ['API'],
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
    <div className="space-y-3 animate-fade-in h-full flex flex-col">
      <div className="flex-shrink-0 flex gap-2">
        <div className="flex-1">
          <InputSearch value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models..." />
        </div>
        <button
          onClick={handleRefreshModels}
          className="flex items-center gap-2 px-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl badge transition-colors border border-separator cursor-pointer"
          title="Refresh Library"
        >
          <Icon name="RefreshCw" size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 min-h-0 space-y-2">
        {filteredModels.length > 0 ? (
          filteredModels.map((model: Model) => {
            const isEnabled = !settings.disabledModels.includes(model.id);
            return (
              <div
                key={model.id}
                className={clsx(
                  'flex items-center gap-2 p-2 rounded-xl border transition-all',
                  isEnabled ? 'bg-line border-separator' : 'bg-surface/50 border-transparent opacity-60',
                )}
              >
                <div
                  className={clsx(
                    'p-2 rounded-lg flex-shrink-0',
                    isEnabled ? clsx('bg-surface/50', model.color || 'text-text-secondary') : 'bg-surface/50 text-text-secondary/50',
                  )}
                >
                  <Icon name={model.icon} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('font-bold text-sm', isEnabled ? 'text-text-primary' : 'text-text-secondary')}>
                      {toTitleCase(model.name)}
                    </span>
                    {effectiveModelId === model.id && isEnabled && <div className="badge-primary">Default</div>}
                    {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                  </div>
                  <div className="text-[10px] text-text-secondary/80 font-mono leading-tight">{model.id}</div>
                  {model.description && <p className="text-xs text-text-secondary line-clamp-1 mt-1">{model.description}</p>}
                </div>

                <InputSwitch checked={isEnabled} onChange={() => toggleModel(model.id)} />
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-3 text-text-secondary bg-line rounded-xl border border-dashed border-separator">
            <Icon name="Search" size={24} className="mb-2 opacity-50" />
            <p className="text-sm">No models match "{modelSearch}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const HistorySection: FC<{ sessions: Record<string, ChatSession> }> = ({ sessions }) => {
  const updateStore = useUpdateStore();
  const setConfirm = useConfirm();
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 7;

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
    <div className="space-y-3 animate-fade-in flex flex-col h-full">
      <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
      <div className="flex flex-col gap-3 flex-shrink-0">
        <p className="settings-info-box">
          Back up your conversation history or migrate it to another device. Importing data will merge with your existing conversations.
        </p>
      </div>
      <div className="settings-history-table">
        <div className="settings-history-header">
          <div className="w-8 flex-shrink-0 flex items-center justify-center">
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
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 px-2 py-1 bg-danger/10 hover:bg-danger/20 border border-danger/20 rounded-md text-xs font-bold text-danger transition-colors uppercase tracking-wide cursor-pointer"
              >
                <Icon name="Trash2" size={12} />
                Delete ({selectedSessionIds.size})
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-2 py-1 bg-surface hover:bg-separator border border-separator rounded-md text-xs font-bold text-text-secondary transition-colors uppercase tracking-wide cursor-pointer"
            >
              <Icon name="Upload" size={12} />
              Export {selectedSessionIds.size > 0 ? `(${selectedSessionIds.size})` : ''}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 bg-surface hover:bg-separator border border-separator rounded-md text-xs font-bold text-text-secondary transition-colors uppercase tracking-wide cursor-pointer"
            >
              <Icon name="Download" size={12} />
              Import
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-separator">
          {currentHistoryItems.length > 0 ? (
            currentHistoryItems.map((session) => (
              <div key={session.id} className={clsx('settings-history-row', selectedSessionIds.has(session.id) && 'settings-history-row-active')}>
                <div className="w-8 flex-shrink-0 flex items-center justify-center">
                  <button
                    onClick={() => toggleSelectSession(session.id)}
                    className={clsx('checkbox-base', selectedSessionIds.has(session.id) && 'checked')}
                  >
                    <Icon name="Check" size={12} strokeWidth={4} />
                  </button>
                </div>
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-sm text-text-primary font-medium truncate">{session.title}</div>
                  <div className="text-xs text-text-secondary font-mono mt-1">{session.id}</div>
                </div>
                <div className="text-xs text-text-secondary whitespace-nowrap tabular-nums">{timeAgo(session.updatedAt)}</div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-2">
              <Icon name="Inbox" size={32} className="opacity-20" />
              <p className="text-sm">No chat history available.</p>
            </div>
          )}
        </div>
      </div>

      {totalHistoryPages > 1 && (
        <div className="flex justify-between items-center pt-2 flex-shrink-0">
          <div className="text-xs text-text-secondary">
            Page {historyPage + 1} of {totalHistoryPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
              disabled={historyPage === 0}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Icon name="ChevronLeft" size={12} />
              Prev
            </button>
            <button
              onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
              disabled={historyPage >= totalHistoryPages - 1}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface border border-separator text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <Icon name="ChevronRight" size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface InstructionSectionProps {
  readonly instruction: Partial<Instruction>;
  readonly onChange: (updates: Partial<Instruction>) => void;
  readonly footer?: string;
}

export const InstructionSection: FC<InstructionSectionProps> = ({ instruction, onChange, footer }) => (
  <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
    <div className="space-y-2">
      <label className="settings-label">System Instruction</label>
      <InputTextarea
        value={instruction.systemPrompt || ''}
        onChange={(e) => onChange({ systemPrompt: e.target.value })}
        placeholder="Enter system instructions..."
        minRows={8}
        maxRows={8}
      />
      {footer && <p className="text-xs text-text-secondary pl-1">{footer}</p>}
    </div>
  </div>
);

interface PersonalisationSectionProps {
  readonly personalisation: Partial<Personalisation>;
  readonly onChange: (updates: Partial<Personalisation>) => void;
}

export const PersonalisationSection: FC<PersonalisationSectionProps> = ({ personalisation, onChange }) => (
  <div className="space-y-3 animate-fade-in">
    <div className="space-y-2">
      <label className="settings-label">What should Yuji call you?</label>
      <InputText
        value={personalisation.userName || ''}
        onChange={(e) => onChange({ userName: e.target.value.slice(0, 50) })}
        placeholder="Enter your name..."
      />
    </div>
    <div className="space-y-2">
      <label className="settings-label">What do you do?</label>
      <InputText
        value={personalisation.userOccupation || ''}
        onChange={(e) => onChange({ userOccupation: e.target.value.slice(0, 100) })}
        placeholder="Programmer, engineer, student..."
      />
    </div>
    <div className="space-y-2">
      <label className="settings-label">What traits should Yuji have?</label>
      <div className="relative group">
        <div className="flex flex-wrap gap-1 p-1 bg-surface-hover/40 border border-separator/30 rounded-xl focus-within:border-line/50 focus-within:bg-surface transition-all min-h-[46px]">
          {(personalisation.assistantTraits || []).map((trait) => (
            <div
              key={trait}
              className="flex items-center gap-1 px-2 py-1 bg-white/10 text-text-primary text-xs rounded-lg animate-fade-in border border-white/5"
            >
              {trait}
              <button
                onClick={() => {
                  const next = (personalisation.assistantTraits || []).filter((t) => t !== trait);
                  onChange({ assistantTraits: next });
                }}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <Icon name="X" size={10} />
              </button>
            </div>
          ))}
          <input
            className="flex-1 bg-transparent border-none outline-none py-1 px-1 text-sm text-text-primary placeholder:text-text-tertiary min-w-[120px]"
            placeholder={(personalisation.assistantTraits || []).length === 0 ? 'Type a trait and press Enter...' : ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const val = e.currentTarget.value.trim().toLowerCase();
                if (val && !(personalisation.assistantTraits || []).includes(val)) {
                  onChange({ assistantTraits: [...(personalisation.assistantTraits || []), val] });
                  e.currentTarget.value = '';
                }
              } else if (e.key === 'Backspace' && !e.currentTarget.value && (personalisation.assistantTraits || []).length > 0) {
                const next = [...(personalisation.assistantTraits || [])];
                next.pop();
                onChange({ assistantTraits: next });
              }
            }}
            maxLength={100}
          />
        </div>
      </div>
    </div>
    <div className="space-y-2">
      <label className="settings-label">Anything else Yuji should know about you?</label>
      <InputTextarea
        value={personalisation.additionalContext || ''}
        onChange={(e) => onChange({ additionalContext: e.target.value.slice(0, 3000) })}
        placeholder="Interests, values, or preferences to keep in mind..."
        minRows={5}
        maxRows={5}
      />
    </div>
  </div>
);

interface OverrideSectionProps {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children?: ReactNode;
  readonly lockDescription?: string;
}

export const OverrideSection: FC<OverrideSectionProps> = ({ title, description, checked, onChange, children, lockDescription }) => {
  if (!checked) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-secondary bg-line rounded-xl border border-dashed border-separator animate-fade-in">
        <Icon name="Lock" size={24} className="mb-2 opacity-50" />
        <p className="text-sm">{lockDescription || description}</p>
        <button
          onClick={() => onChange(true)}
          className="mt-4 text-xs font-bold text-primary hover:underline uppercase tracking-widest transition-all"
        >
          Enable Override
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between py-2 border-b border-separator">
        <div>
          <div className="text-sm text-text-primary">{title}</div>
          <div className="text-xs text-text-secondary">{description}</div>
        </div>
        <InputSwitch checked={checked} onChange={onChange} />
      </div>
      {checked && children}
    </div>
  );
};
