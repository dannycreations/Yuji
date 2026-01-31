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
import { SettingModal, SettingTabItem } from '../shared/SettingModal';

import type { ChangeEvent, FC, KeyboardEvent } from 'react';
import type { AppState, ChatSession, Settings } from '../../app/Schema';

type GlobalSettingTab = 'general' | 'connection' | 'models' | 'persona' | 'history';

const GLOBAL_SETTING_TABS: SettingTabItem[] = [
  { icon: 'Settings', id: 'general', label: 'General' },
  { icon: 'Link', id: 'connection', label: 'Connection' },
  { icon: 'Cpu', id: 'models', label: 'Models' },
  { icon: 'Sparkles', id: 'persona', label: 'Persona' },
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
  const [traitInput, setTraitInput] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  // History Tab State
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 7;

  const handleRefreshModels = () => {
    YujiRuntime.runPromise(
      Effect.gen(function* () {
        const llm = yield* LLMProvider;
        const result = yield* llm.fetchModels(settings);

        const apiModels: ReadonlyArray<Model> = result.data.map((m: any) =>
          Model({
            id: m.id,
            name: m.id,
            description: `Fetched from ${settings.baseUrl}`,
            provider: 'OpenAI Compatible',
            icon: 'Cpu',
            color: 'text-zinc-400',
            tags: ['API'],
          }),
        );

        const staticIds = new Set(availableModels.map((m: any) => m.id));
        const newModels = apiModels.filter((m: any) => !staticIds.has(m.id));

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
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (activeTab === 'persona') {
      const parts: string[] = [];
      parts.push('You are a helpful, intelligent, and precise AI assistant.');
      if (settings.userName) parts.push(`The user's name is ${settings.userName}.`);
      if (settings.userOccupation) parts.push(`The user acts as a ${settings.userOccupation}.`);
      if (settings.assistantTraits && settings.assistantTraits.length > 0) {
        parts.push(`You should act ${settings.assistantTraits.join(', ')}.`);
      }
      if (settings.additionalContext) {
        parts.push(`\nAdditional Context:\n${settings.additionalContext}`);
      }
      parts.push(
        '\nYou answer questions accurately using Markdown formatting. Support LaTeX math using $ and $$ delimiters, and Mermaid diagrams using ```mermaid blocks.',
      );

      const newSystemPrompt = parts.join(' ');
      if (newSystemPrompt !== settings.defaultSystemPrompt) {
        updateSettings({ defaultSystemPrompt: newSystemPrompt });
      }
    }
  }, [settings.userName, settings.userOccupation, settings.assistantTraits, settings.additionalContext]);

  if (!isSettingsOpen) return null;

  const handleAddTrait = (trait: string) => {
    const formatted = trait.trim().toLowerCase();
    if (formatted && !settings.assistantTraits.includes(formatted)) {
      updateSettings({ assistantTraits: [...settings.assistantTraits, formatted] });
    }
    setTraitInput('');
  };

  const handleRemoveTrait = (trait: string) => {
    updateSettings({ assistantTraits: (settings.assistantTraits as string[]).filter((t: string) => t !== trait) });
  };

  const handleKeyDownTrait = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTrait(traitInput);
    }
  };

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
          <div className="space-y-5 animate-fade-in">
            <h3 className="text-lg font-medium text-white mb-4">General Settings</h3>
            <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/[0.07] transition-colors">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-zinc-200 block">Enter to Send</label>
                <p className="text-xs text-zinc-500">Sends the message immediately when you press Enter.</p>
              </div>
              <button
                onClick={() => updateSettings({ enterToSend: !settings.enterToSend })}
                className={clsx(
                  'w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-1 focus:ring-primary/50 flex-shrink-0',
                  settings.enterToSend ? 'bg-primary' : 'bg-zinc-700',
                )}
              >
                <div
                  className={clsx(
                    'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm',
                    settings.enterToSend ? 'translate-x-5' : '',
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/[0.07] transition-colors">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-zinc-200 block">Theme</label>
                <p className="text-xs text-zinc-500">Current theme applied to the interface.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-black/40 rounded-lg text-xs font-medium text-zinc-300 border border-white/10">Dark (Default)</div>
              </div>
            </div>
          </div>
        );

      case 'connection':
        return (
          <div className="space-y-5 animate-fade-in">
            <h3 className="text-lg font-medium text-white mb-4">Connection & Provider</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">API Provider</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all"
                  value="openai"
                  disabled
                >
                  <option value="openai">OpenAI Compatible</option>
                </select>
                <Icon name="ChevronDown" size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Base URL</label>
              <div className="relative group">
                <Icon
                  name="Link"
                  size={14}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary transition-colors"
                />
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  className="w-full bg-black border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                  placeholder="http://localhost:11434/v1"
                />
              </div>
              <p className="text-[11px] text-zinc-500 pl-1">For LocalAI or Ollama, use your local endpoint.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">API Key</label>
              <div className="relative group">
                <Icon
                  name="Key"
                  size={14}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary transition-colors"
                />
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => updateSettings({ apiKey: e.target.value })}
                  className="w-full bg-black border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>
        );

      case 'models':
        return (
          <div className="space-y-5 animate-fade-in h-full flex flex-col">
            <div className="flex-shrink-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Model Library</h3>
                <button
                  onClick={handleRefreshModels}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
                >
                  <Icon name="RefreshCw" size={12} />
                  Refresh Library
                </button>
              </div>
              <div className="relative group">
                <Icon
                  name="Search"
                  size={14}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary transition-colors"
                />
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                  placeholder="Search models by name, provider, or ID..."
                />
              </div>
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
                        isEnabled ? 'bg-white/5 border-white/10' : 'bg-black/20 border-transparent opacity-60',
                      )}
                    >
                      <div
                        className={clsx(
                          'p-2.5 rounded-lg flex-shrink-0',
                          isEnabled ? clsx('bg-black/40', model.color || 'text-zinc-500') : 'bg-black/40 text-zinc-600',
                        )}
                      >
                        <Icon name={model.icon as any} size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('font-bold text-sm', isEnabled ? 'text-zinc-200' : 'text-zinc-500')}>{model.name}</span>
                          {effectiveDefaultModelId === model.id && isEnabled && (
                            <div className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wide">
                              Default
                            </div>
                          )}
                          {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-1">{model.description}</p>
                        <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{model.id}</div>
                      </div>

                      <button
                        onClick={() => toggleModel(model.id)}
                        className={clsx(
                          'w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-1 focus:ring-primary/50 flex-shrink-0',
                          isEnabled ? 'bg-primary' : 'bg-zinc-700',
                        )}
                      >
                        <div
                          className={clsx(
                            'absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm',
                            isEnabled ? 'translate-x-5' : '',
                          )}
                        />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 bg-white/5 rounded-xl border border-dashed border-white/10">
                  <Icon name="Search" size={24} className="mb-2 opacity-50" />
                  <p className="text-sm">No models match "{modelSearch}"</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-5 animate-fade-in">
            <h3 className="text-lg font-medium text-white mb-4">User Persona & Context</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Display Name</label>
              <input
                type="text"
                value={settings.userName}
                onChange={(e) => updateSettings({ userName: e.target.value.slice(0, 50) })}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                placeholder="How should the AI address you?"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Occupation</label>
              <input
                type="text"
                value={settings.userOccupation}
                onChange={(e) => updateSettings({ userOccupation: e.target.value.slice(0, 100) })}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                placeholder="What do you do?"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Assistant Traits</label>
              <div className="p-2.5 bg-black border border-white/10 rounded-xl flex flex-wrap gap-2 min-h-[50px] focus-within:border-primary/50 transition-all">
                {(settings.assistantTraits as string[]).map((trait: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 bg-white/10 text-zinc-200 text-xs px-2.5 py-1 rounded-lg border border-white/5 font-medium"
                  >
                    <span>{trait}</span>
                    <button onClick={() => handleRemoveTrait(trait)} className="hover:text-red-400 transition-colors">
                      <Icon name="X" size={12} />
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={traitInput}
                  onChange={(e) => setTraitInput(e.target.value)}
                  onKeyDown={handleKeyDownTrait}
                  className="bg-transparent outline-none flex-1 min-w-[120px] text-sm text-white placeholder:text-zinc-700 py-1"
                  placeholder="Add a trait and press Enter..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Custom Context</label>
              <textarea
                value={settings.additionalContext}
                onChange={(e) => updateSettings({ additionalContext: e.target.value.slice(0, 3000) })}
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700 min-h-[120px] resize-none leading-relaxed"
                placeholder="Any special instructions, background information, or preferences for the AI to know..."
              />
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="space-y-5 animate-fade-in flex flex-col h-full">
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

            <div className="flex flex-col gap-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Data Management</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-3 py-2 bg-black hover:bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-zinc-300 transition-colors uppercase tracking-wide"
                  >
                    <Icon name="Upload" size={14} />
                    Export
                  </button>
                  <button
                    onClick={handleImportClick}
                    className="flex items-center gap-2 px-3 py-2 bg-black hover:bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-zinc-300 transition-colors uppercase tracking-wide"
                  >
                    <Icon name="Download" size={14} />
                    Import
                  </button>
                </div>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                Back up your conversation history or migrate it to another device. Importing data will merge with your existing conversations.
              </p>
            </div>

            <div className="flex-1 min-h-0 flex flex-col border border-white/10 rounded-xl overflow-hidden bg-black/40">
              <div className="flex items-center px-4 py-3 border-b border-white/10 bg-white/5">
                <div className="w-8 flex-shrink-0">
                  <div className="w-4 h-4 rounded border border-zinc-600/50" />
                </div>
                <div className="flex-1 text-xs font-bold text-zinc-300 uppercase tracking-wider">Title</div>
                <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Last Updated</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-white/5">
                {currentHistoryItems.length > 0 ? (
                  currentHistoryItems.map((session) => (
                    <div key={session.id} className="flex items-center px-4 py-3.5 hover:bg-white/5 transition-colors group">
                      <div className="w-8 flex-shrink-0">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-zinc-700 bg-black/50 checked:bg-primary accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-sm text-zinc-200 font-medium truncate">{session.title}</div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{session.id}</div>
                      </div>
                      <div className="text-xs text-zinc-500 whitespace-nowrap tabular-nums">{timeAgo(session.updatedAt)}</div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                    <Icon name="Inbox" size={32} className="opacity-20" />
                    <p className="text-sm">No chat history available.</p>
                  </div>
                )}
              </div>
            </div>

            {totalHistoryPages > 1 && (
              <div className="flex justify-between items-center pt-2 flex-shrink-0">
                <div className="text-xs text-zinc-500">
                  Page {historyPage + 1} of {totalHistoryPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                    disabled={historyPage === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black border border-white/10 text-xs font-medium text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <Icon name="ChevronLeft" size={12} />
                    Prev
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
                    disabled={historyPage >= totalHistoryPages - 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black border border-white/10 text-xs font-medium text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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

  return (
    <SettingModal
      title="Settings"
      tabs={GLOBAL_SETTING_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={toggleSettings}
      footer={
        <button
          onClick={toggleSettings}
          className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary_hover transition-colors shadow-lg shadow-primary/20 active:scale-95 duration-100"
        >
          Done
        </button>
      }
      sidebarBottom={
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface_light border border-white/5 flex items-center justify-center text-zinc-400">
            <Icon name="User" size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{settings.userName || 'Local User'}</div>
            <div className="text-[10px] text-zinc-500 truncate">Pro Account</div>
          </div>
        </div>
      }
    >
      {renderContent()}
    </SettingModal>
  );
};
