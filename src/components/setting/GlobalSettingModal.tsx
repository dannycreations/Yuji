import clsx from 'clsx';
import { Effect } from 'effect';
import { useEffect, useRef, useState } from 'react';

import { DEFAULT_SETTINGS } from '../../app/Constant';
import { Model } from '../../app/Schema';
import { YujiRuntime } from '../../app/Yuji';
import { useAction, useStore } from '../../hooks/useStore';
import { LLMProvider } from '../../providers/LLMProvider';
import { StoreService } from '../../services/StoreService';
import { timeAgo } from '../../utilities/time';
import { Icon } from '../shared/Icon';
import { InputSwitch, InputText, InputTextarea } from '../shared/InputArea';
import { SettingModal } from '../shared/modal/SettingModal';

import type { ChangeEvent, FC } from 'react';
import type { AppState, ChatSession, Settings } from '../../app/Schema';
import type { SettingTabItem } from '../shared/modal/SettingModal';

type GlobalSettingTab = 'general' | 'connection' | 'models' | 'persona' | 'history';

const GLOBAL_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Link', id: 'connection', label: 'Connection' },
  { icon: 'Cpu', id: 'models', label: 'Models' },
  { icon: 'User', id: 'persona', label: 'Personalization' },
  { icon: 'History', id: 'history', label: 'History & Sync' },
];

export const GlobalSettingModal: FC = () => {
  const isSettingsOpen = useStore((s: AppState) => s.isSettingsOpen, false);
  const settings = useStore((s: AppState) => s.settings, DEFAULT_SETTINGS);
  const sessions = useStore((s: AppState) => s.sessions, {});
  const availableModels = useStore((s: AppState) => s.availableModels, []);

  const toggleSettings = useAction(() =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((s) => ({ ...s, isSettingsOpen: !s.isSettingsOpen }));
    }),
  );

  const updateSettings = useAction((newSettings: Partial<Settings>) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((s) => ({ ...s, settings: { ...s.settings, ...newSettings } }));
    }),
  );

  const importSessions = useAction((newSessions: Record<string, ChatSession>) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((s) => ({ ...s, sessions: { ...s.sessions, ...newSessions } }));
    }),
  );

  const setAvailableModels = useAction((models: ReadonlyArray<Model>) =>
    Effect.gen(function* () {
      const store = yield* StoreService;
      yield* store.update((s) => ({ ...s, availableModels: models }));
    }),
  );
  const [activeTab, setActiveTab] = useState<GlobalSettingTab>('general');
  const [modelSearch, setModelSearch] = useState('');

  // History Tab State
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 7;

  const handleRefreshModels = () => {
    YujiRuntime.runPromise(
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
      }).pipe(
        Effect.catchAll((error) => {
          console.error('Failed to fetch models:', error);
          return Effect.void;
        }),
      ),
    );
  };

  useEffect(() => {
    if (isSettingsOpen) {
      setHistoryPage(0);
      setSelectedSessionIds(new Set());
    }
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessions));
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

  const filteredModels = (availableModels as ReadonlyArray<Model>)
    .filter(
      (m: Model) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.provider.toLowerCase().includes(modelSearch.toLowerCase()),
    )
    .sort((a, b) => {
      const aDisabled = (settings.disabledModels || []).includes(a.id);
      const bDisabled = (settings.disabledModels || []).includes(b.id);
      if (aDisabled && !bDisabled) return 1;
      if (!aDisabled && bDisabled) return -1;
      return 0;
    });

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

  const disabledModels = settings.disabledModels || [];
  const activeModels = (availableModels as ReadonlyArray<Model>).filter((m) => !disabledModels.includes(m.id));
  const effectiveDefaultModelId = activeModels.find((m) => m.id === settings.defaultModel)?.id || activeModels[0]?.id;

  const toggleModel = (modelId: string) => {
    const isDisabled = disabledModels.includes(modelId);
    let newDisabledModels = [...disabledModels];

    if (isDisabled) {
      newDisabledModels = newDisabledModels.filter((id) => id !== modelId);
    } else {
      newDisabledModels.push(modelId);
    }
    updateSettings({ disabledModels: newDisabledModels });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="animate-fade-in flex flex-col">
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
          </div>
        );

      case 'connection':
        return (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-2">
              <label className="label-caps">API Provider</label>
              <div className="relative">
                <select className="select-base" value="openai" disabled>
                  <option value="openai">OpenAI Compatible</option>
                </select>
                <Icon name="ChevronDown" size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="label-caps">Base URL</label>
              <InputText
                leftIcon="Link"
                value={settings.baseUrl}
                onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
              <p className="text-xs text-text-secondary pl-1">For LocalAI or Ollama, use your local endpoint.</p>
            </div>

            <div className="space-y-2">
              <label className="label-caps">API Key</label>
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
          <div className="space-y-5 animate-fade-in h-full flex flex-col">
            <div className="flex-shrink-0 flex gap-2">
              <div className="flex-1">
                <InputText leftIcon="Search" value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models..." />
              </div>
              <button
                onClick={handleRefreshModels}
                className="flex items-center gap-2 px-4 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl badge transition-colors border border-separator cursor-pointer"
                title="Refresh Library"
              >
                <Icon name="RefreshCw" size={14} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 min-h-0 space-y-2">
              {filteredModels.length > 0 ? (
                filteredModels.map((model: Model) => {
                  const isDisabled = disabledModels.includes(model.id);
                  const isEnabled = !isDisabled;
                  return (
                    <div
                      key={model.id}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-xl border transition-all',
                        isEnabled ? 'bg-line border-separator' : 'bg-surface/50 border-transparent opacity-60',
                      )}
                    >
                      <div
                        className={clsx(
                          'p-2.5 rounded-lg flex-shrink-0',
                          isEnabled ? clsx('bg-surface/50', model.color || 'text-text-secondary') : 'bg-surface/50 text-text-secondary/50',
                        )}
                      >
                        <Icon name={model.icon} size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('font-bold text-sm', isEnabled ? 'text-text-primary' : 'text-text-secondary')}>{model.name}</span>
                          {effectiveDefaultModelId === model.id && isEnabled && <div className="badge-primary">Default</div>}
                          {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-1">{model.description}</p>
                        <div className="text-xs text-text-secondary/80 font-mono mt-0.5">{model.id}</div>
                      </div>

                      <InputSwitch checked={isEnabled} onChange={() => toggleModel(model.id)} />
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-text-secondary bg-line rounded-xl border border-dashed border-separator">
                  <Icon name="Search" size={24} className="mb-2 opacity-50" />
                  <p className="text-sm">No models match "{modelSearch}"</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-8 animate-fade-in">
            <div className="space-y-4">
              <h3 className="settings-section-title">About you</h3>

              <div className="space-y-2">
                <label className="settings-label">Nickname</label>
                <InputText
                  value={settings.userName}
                  onChange={(e) => updateSettings({ userName: e.target.value.slice(0, 50) })}
                  placeholder="What would you like Yuji to call you?"
                />
              </div>

              <div className="space-y-2">
                <label className="settings-label">Occupation</label>
                <InputText
                  value={settings.userOccupation}
                  onChange={(e) => updateSettings({ userOccupation: e.target.value.slice(0, 100) })}
                  placeholder="What do you do?"
                />
              </div>

              <div className="space-y-2">
                <label className="settings-label">More about you</label>
                <InputTextarea
                  value={settings.additionalContext}
                  onChange={(e) => updateSettings({ additionalContext: e.target.value.slice(0, 3000) })}
                  minRows={4}
                  placeholder="What would you like Yuji to know about you to provide better responses?"
                />
              </div>
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="space-y-5 animate-fade-in flex flex-col h-full">
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

            <div className="flex flex-col gap-4 flex-shrink-0">
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
                      'checkbox-base checkbox-header',
                      currentHistoryItems.length > 0 && currentHistoryItems.every((s) => selectedSessionIds.has(s.id)) && 'checked',
                    )}
                  >
                    <Icon name="Check" size={10} strokeWidth={4} />
                  </button>
                </div>
                <div className="flex-1 label-caps text-text-primary">Title</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-2 py-1 bg-surface hover:bg-separator border border-separator rounded-md text-xs font-bold text-text-secondary transition-colors uppercase tracking-wide cursor-pointer"
                  >
                    <Icon name="Upload" size={12} />
                    Export
                  </button>
                  <button
                    onClick={handleImportClick}
                    className="flex items-center gap-1.5 px-2 py-1 bg-surface hover:bg-separator border border-separator rounded-md text-xs font-bold text-text-secondary transition-colors uppercase tracking-wide cursor-pointer"
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
                          className={clsx('checkbox-base', selectedSessionIds.has(session.id) ? 'checked' : 'unchecked')}
                        >
                          <Icon name="Check" size={10} strokeWidth={4} />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-sm text-text-primary font-medium truncate">{session.title}</div>
                        <div className="text-xs text-text-secondary font-mono mt-0.5">{session.id}</div>
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-separator text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <Icon name="ChevronLeft" size={12} />
                    Prev
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
                    disabled={historyPage >= totalHistoryPages - 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-separator text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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

  return (
    <SettingModal tabs={GLOBAL_SETTING_TABS} activeTab={activeTab} onTabChange={setActiveTab} onClose={toggleSettings} title={activeTabLabel}>
      {renderContent()}
    </SettingModal>
  );
};
