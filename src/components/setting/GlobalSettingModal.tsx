import clsx from 'clsx';
import { Effect } from 'effect';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../../app/Constant';
import { Model } from '../../app/Schema';
import { useAction, useConfirm, useStore, useToggleSetting, useUpdateStore } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { toTitleCase } from '../../utilities/CommonUtil';
import { timeAgo } from '../../utilities/TimeUtil';
import { Icon } from '../shared/Icon';
import { InputSearch, InputSelect, InputSwitch, InputText } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';
import { InstructionSection, PersonalisationSection } from './SettingSection';

import type { ChangeEvent, FC } from 'react';
import type { AppState, ChatSession, Settings } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

type GlobalSettingTab = 'general' | 'connection' | 'models' | 'instruction' | 'persona' | 'history';

const GLOBAL_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Link', id: 'connection', label: 'Connection' },
  { icon: 'Cpu', id: 'models', label: 'Models' },
  { icon: 'Terminal', id: 'instruction', label: 'Instruction' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
  { icon: 'History', id: 'history', label: 'History & Sync' },
];

export const GlobalSettingModal: FC = () => {
  const isSettingOpen = useStore((s: AppState) => s.isSettingOpen, false);
  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);
  const sessions = useStore((s: AppState) => s.sessions, {});
  const availableModels = useStore((s: AppState) => s.availableModels, []);

  const toggleSetting = useToggleSetting();
  const updateStore = useUpdateStore();

  const updateSettings = (newSettings: Partial<Settings>) => updateStore((s) => ({ ...s, settings: { ...s.settings, ...newSettings } }));

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

  const setAvailableModels = (models: ReadonlyArray<Model>) => updateStore((s) => ({ ...s, availableModels: models }));
  const [activeTab, setActiveTab] = useState<GlobalSettingTab>('general');
  const [modelSearch, setModelSearch] = useState('');

  // History Tab State
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 7;

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

  useEffect(() => {
    if (isSettingOpen) {
      setHistoryPage(0);
      setSelectedSessionIds(new Set());
    }
  }, [isSettingOpen]);

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const setConfirm = useConfirm();

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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          importSessions(json);
          alert('History imported successfully!');
        }
      } catch (err) {
        console.error('Failed to parse history file', err);
        alert('Failed to import history: Invalid file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const filteredModels = useMemo(() => {
    return availableModels
      .filter(
        (m: Model) =>
          m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.provider.toLowerCase().includes(modelSearch.toLowerCase()),
      )
      .sort((a, b) => {
        const aDisabled = settings.disabledModels.includes(a.id);
        const bDisabled = settings.disabledModels.includes(b.id);
        if (aDisabled && !bDisabled) return 1;
        if (!aDisabled && bDisabled) return -1;
        return 0;
      });
  }, [availableModels, modelSearch, settings.disabledModels]);

  // History Pagination Logic
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
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSessionIds(next);
  };

  const activeModels = useMemo(
    () => availableModels.filter((m) => !settings.disabledModels.includes(m.id)),
    [availableModels, settings.disabledModels],
  );
  const effectiveModelId = useMemo(
    () => activeModels.find((m: Model) => m.id === settings.model)?.id || activeModels[0]?.id,
    [activeModels, settings.model],
  );

  const toggleModel = (modelId: string) => {
    const isDisabled = settings.disabledModels.includes(modelId);
    const newDisabledModels = isDisabled ? settings.disabledModels.filter((id) => id !== modelId) : [...settings.disabledModels, modelId];
    updateSettings({ disabledModels: newDisabledModels });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
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
              <InputSwitch checked={settings.enterToSend} onChange={(checked) => updateSettings({ enterToSend: checked })} />
            </div>

            <div className="panel-section flex items-center justify-between">
              <div className="text-sm text-text-primary">Expand code blocks</div>
              <InputSwitch checked={settings.expandCodeblock} onChange={(checked) => updateSettings({ expandCodeblock: checked })} />
            </div>
          </div>
        );

      case 'connection':
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
                onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </div>

            <div className="space-y-2">
              <label className="settings-label">API Key</label>
              <InputText
                type="password"
                leftIcon="Key"
                value={settings.apiKey}
                onChange={(e) => updateSettings({ apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
          </div>
        );

      case 'models':
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

      case 'instruction':
        return (
          <InstructionSection
            instruction={settings.instruction}
            onChange={(updates) => updateSettings({ instruction: { ...settings.instruction, ...updates } })}
            footer="This instruction will be sent as the system prompt to the AI."
          />
        );

      case 'persona':
        return (
          <div className="space-y-3 animate-fade-in h-full overflow-y-auto pr-2">
            <PersonalisationSection
              personalisation={settings.personalisation}
              onChange={(updates) => updateSettings({ personalisation: { ...settings.personalisation, ...updates } })}
            />
          </div>
        );

      case 'history':
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
                    onClick={handleImportClick}
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
                    <div
                      key={session.id}
                      className={clsx('settings-history-row', selectedSessionIds.has(session.id) && 'settings-history-row-active')}
                    >
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
    }
  };

  const activeTabLabel = GLOBAL_SETTING_TABS.find((t) => t.id === activeTab)?.label || '';

  if (!isSettingOpen) return null;

  return (
    <SettingModal tabs={GLOBAL_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={toggleSetting} title={activeTabLabel}>
      {renderContent()}
    </SettingModal>
  );
};
