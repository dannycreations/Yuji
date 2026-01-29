import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';

import { ChatSession } from '../app/types';
import { useStore } from '../stores/useStore';
import { Icon } from './Icon';

type SettingsTab = 'general' | 'connection' | 'models' | 'persona' | 'history';

const RECOMMENDED_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: "OpenAI's flagship multimodal model. Fast and intelligent.",
    provider: 'OpenAI',
    icon: 'Sparkles',
    tags: ['Smart', 'Multi'],
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'High-intelligence model with broad general knowledge.',
    provider: 'OpenAI',
    icon: 'Zap',
    tags: ['Smart'],
  },
  {
    id: 'claude-3-5-sonnet-20240620',
    name: 'Claude 3.5 Sonnet',
    description: 'Exceptional coding and reasoning capabilities.',
    provider: 'Anthropic',
    icon: 'Brain',
    tags: ['Coding', 'Smart'],
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: 'Top-tier reasoning for complex tasks.',
    provider: 'Anthropic',
    icon: 'Lightbulb',
    tags: ['Reasoning'],
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Mid-size multimodal model for complex reasoning.',
    provider: 'Google',
    icon: 'Orbit',
    tags: ['Long Context'],
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast, cost-effective multimodal model.',
    provider: 'Google',
    icon: 'Zap',
    tags: ['Fast'],
  },
  {
    id: 'qwen-2.5-72b',
    name: 'Qwen 2.5 72B',
    description: 'Versatile open model with strong reasoning.',
    provider: 'Alibaba',
    icon: 'Cpu',
    tags: ['Open'],
  },
  { id: 'llama3-70b-8192', name: 'Llama 3 70B', description: 'Powerful open weights model.', provider: 'Meta', icon: 'Box', tags: ['Open'] },
];

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return 'just now';
}

export const SettingsDialog: React.FC = () => {
  const { isSettingsOpen, toggleSettings, settings, updateSettings, sessions, importSessions } = useStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [traitInput, setTraitInput] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  // History Tab State
  const [historyPage, setHistoryPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ITEMS_PER_PAGE = 7;

  useEffect(() => {
    if (isSettingsOpen) {
      setModelSearch(settings.defaultModel);
      setHistoryPage(0);
    }
  }, [isSettingsOpen, settings.defaultModel]);

  useEffect(() => {
    if (activeTab === 'persona') {
      const parts = [];
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

  const tabs: { id: SettingsTab; label: string; icon: any; description?: string }[] = [
    { id: 'general', label: 'General', icon: 'Settings', description: 'App preferences' },
    { id: 'connection', label: 'Connection', icon: 'Link', description: 'Provider settings' },
    { id: 'models', label: 'Models', icon: 'Cpu', description: 'Model config' },
    { id: 'persona', label: 'Persona', icon: 'Sparkles', description: 'System prompts' },
    { id: 'history', label: 'History & Sync', icon: 'History', description: 'Manage chat data' },
  ];

  const handleAddTrait = (trait: string) => {
    const formatted = trait.trim().toLowerCase();
    if (formatted && !settings.assistantTraits.includes(formatted)) {
      updateSettings({ assistantTraits: [...settings.assistantTraits, formatted] });
    }
    setTraitInput('');
  };

  const handleRemoveTrait = (trait: string) => {
    updateSettings({ assistantTraits: settings.assistantTraits.filter((t) => t !== trait) });
  };

  const handleKeyDownTrait = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTrait(traitInput);
    }
  };

  const handleModelSelect = (modelId: string) => {
    updateSettings({ defaultModel: modelId });
    setModelSearch(modelId);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === 'object' && json !== null) {
          // Simple validation could be added here
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

  const filteredModels = RECOMMENDED_MODELS.filter(
    (m) =>
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.provider.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  // History Pagination Logic
  const sortedSessions = (Object.values(sessions) as ChatSession[]).sort((a, b) => b.updatedAt - a.updatedAt);
  const totalHistoryPages = Math.ceil(sortedSessions.length / ITEMS_PER_PAGE);
  const currentHistoryItems = sortedSessions.slice(historyPage * ITEMS_PER_PAGE, (historyPage + 1) * ITEMS_PER_PAGE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-2xl h-[560px] bg-surface border border-surface_light rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <div className="flex-shrink-0 bg-surface_light/30 border-b border-surface_light backdrop-blur-md">
          <div className="flex items-center justify-between px-5 py-3.5">
            <h2 className="text-base font-bold text-white tracking-tight">Settings</h2>
            <button onClick={toggleSettings} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-colors">
              <Icon name="X" size={16} />
            </button>
          </div>

          <div className="px-5 flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all outline-none whitespace-nowrap',
                  activeTab === tab.id ? 'border-primary text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700',
                )}
              >
                <Icon name={tab.icon} size={14} className={clsx(activeTab === tab.id ? 'text-primary' : 'text-zinc-500')} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {activeTab !== 'history' && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">{tabs.find((t) => t.id === activeTab)?.label}</h3>
              <p className="text-[10px] text-zinc-500">{tabs.find((t) => t.id === activeTab)?.description}</p>
            </div>
          )}

          <div className="h-full">
            {activeTab === 'general' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between p-3.5 bg-surface_light/20 rounded-xl border border-surface_light/50">
                  <div className="space-y-0.5">
                    <label className="text-xs font-semibold text-zinc-200 block">Enter to Send</label>
                    <p className="text-[10px] text-zinc-500">Immediate sending on Enter key</p>
                  </div>
                  <button
                    onClick={() => updateSettings({ enterToSend: !settings.enterToSend })}
                    className={clsx(
                      'w-9 h-4.5 rounded-full transition-colors relative focus:outline-none focus:ring-1 focus:ring-primary/50',
                      settings.enterToSend ? 'bg-primary' : 'bg-zinc-700',
                    )}
                  >
                    <div
                      className={clsx(
                        'absolute top-0.5 left-0.5 bg-white w-3.5 h-3.5 rounded-full transition-transform shadow-sm',
                        settings.enterToSend ? 'translate-x-4.5' : '',
                      )}
                    />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'connection' && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">API Provider</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none bg-black border border-surface_light rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none"
                      disabled
                      value="openai"
                    >
                      <option value="openai">OpenAI / Compatible</option>
                    </select>
                    <Icon name="ChevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Base URL</label>
                  <div className="relative group">
                    <Icon
                      name="Link"
                      size={12}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary"
                    />
                    <input
                      type="text"
                      value={settings.baseUrl}
                      onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                      className="w-full bg-black border border-surface_light rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">API Key</label>
                  <div className="relative group">
                    <Icon name="Key" size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary" />
                    <input
                      type="password"
                      value={settings.apiKey}
                      onChange={(e) => updateSettings({ apiKey: e.target.value })}
                      className="w-full bg-black border border-surface_light rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                      placeholder="sk-..."
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'models' && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Model Search</label>
                  <div className="relative group">
                    <Icon
                      name="Search"
                      size={12}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary"
                    />
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => {
                        setModelSearch(e.target.value);
                        updateSettings({ defaultModel: e.target.value });
                      }}
                      className="w-full bg-black border border-surface_light rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                      placeholder="Search or enter custom ID..."
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2">
                    {filteredModels.length > 0 ? (
                      filteredModels.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelSelect(model.id)}
                          className={clsx(
                            'flex items-start gap-3 p-2.5 rounded-xl border transition-all text-left',
                            settings.defaultModel === model.id
                              ? 'bg-primary/10 border-primary/40'
                              : 'bg-surface_light/20 border-transparent hover:bg-surface_light/40',
                          )}
                        >
                          <div
                            className={clsx(
                              'p-2 rounded-lg flex-shrink-0',
                              settings.defaultModel === model.id ? 'bg-primary text-white' : 'bg-black/40 text-zinc-500',
                            )}
                          >
                            <Icon name={model.icon as any} size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className={clsx('font-bold text-xs', settings.defaultModel === model.id ? 'text-white' : 'text-zinc-300')}>
                                {model.name}
                              </span>
                              {settings.defaultModel === model.id && <Icon name="Check" size={12} className="text-primary" />}
                            </div>
                            <p className="text-[10px] text-zinc-500 line-clamp-1">{model.description}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-6 text-[10px] text-zinc-500 bg-surface_light/10 rounded-xl border border-dashed border-surface_light">
                        No library models match "{modelSearch}"
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'persona' && (
              <div className="space-y-5 animate-fade-in pb-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Display Name</label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => updateSettings({ userName: e.target.value.slice(0, 50) })}
                    className="w-full bg-black border border-surface_light rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Occupation</label>
                  <input
                    type="text"
                    value={settings.userOccupation}
                    onChange={(e) => updateSettings({ userOccupation: e.target.value.slice(0, 100) })}
                    className="w-full bg-black border border-surface_light rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700"
                    placeholder="Engineer, Researcher..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Assistant Traits</label>
                  <div className="p-2 bg-black border border-surface_light rounded-xl flex flex-wrap gap-1.5 min-h-[40px] focus-within:border-primary/50 transition-all">
                    {settings.assistantTraits.map((trait, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1 bg-surface_light text-zinc-300 text-[10px] px-2 py-0.5 rounded border border-white/5 font-medium"
                      >
                        <span>{trait}</span>
                        <button onClick={() => handleRemoveTrait(trait)} className="hover:text-red-400">
                          <Icon name="X" size={10} />
                        </button>
                      </div>
                    ))}
                    <input
                      type="text"
                      value={traitInput}
                      onChange={(e) => setTraitInput(e.target.value)}
                      onKeyDown={handleKeyDownTrait}
                      className="bg-transparent outline-none flex-1 min-w-[100px] text-[11px] text-white placeholder:text-zinc-700"
                      placeholder="Add trait..."
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Custom Context</label>
                  <textarea
                    value={settings.additionalContext}
                    onChange={(e) => updateSettings({ additionalContext: e.target.value.slice(0, 3000) })}
                    className="w-full bg-black border border-surface_light rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-primary/50 transition-all placeholder:text-zinc-700 min-h-[80px] resize-none"
                    placeholder="Special instructions or background info..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4 animate-fade-in flex flex-col h-full">
                <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

                <div className="flex flex-col gap-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">Chat History</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-1.5 bg-black hover:bg-surface_light border border-surface_light rounded-lg text-xs font-medium text-zinc-300 transition-colors"
                      >
                        <Icon name="Upload" size={14} />
                        Export all
                      </button>
                      <button
                        onClick={handleImportClick}
                        className="flex items-center gap-2 px-3 py-1.5 bg-black hover:bg-surface_light border border-surface_light rounded-lg text-xs font-medium text-zinc-300 transition-colors"
                      >
                        <Icon name="Download" size={14} />
                        Import
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">
                    You can back up your chat history from here to restore or transfer your conversations later. Importing will NOT delete any of your
                    existing conversations.
                  </p>
                </div>

                <div className="flex-1 min-h-0 flex flex-col border border-surface_light rounded-xl overflow-hidden bg-black/20">
                  <div className="flex items-center px-4 py-2.5 border-b border-surface_light/50 bg-surface_light/10">
                    <div className="w-8 flex-shrink-0">
                      <div className="w-4 h-4 rounded border border-zinc-600/50" />
                    </div>
                    <div className="flex-1 text-xs font-semibold text-zinc-300">Title</div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-white/5">
                    {currentHistoryItems.length > 0 ? (
                      currentHistoryItems.map((session) => (
                        <div key={session.id} className="flex items-center px-4 py-3 hover:bg-white/5 transition-colors group">
                          <div className="w-8 flex-shrink-0">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-zinc-700 bg-black/50 checked:bg-primary accent-primary cursor-pointer"
                            />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="text-sm text-zinc-200 font-medium truncate">{session.title}</div>
                          </div>
                          <div className="text-xs text-zinc-500 whitespace-nowrap">{timeAgo(session.updatedAt)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-32 text-zinc-500">
                        <p className="text-xs">No chat history found.</p>
                      </div>
                    )}
                  </div>
                </div>

                {totalHistoryPages > 1 && (
                  <div className="flex justify-end gap-2 pt-1 flex-shrink-0">
                    <button
                      onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                      disabled={historyPage === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black border border-surface_light text-xs font-medium text-zinc-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Icon name="ChevronLeft" size={12} />
                      Previous
                    </button>
                    <button
                      onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages - 1, p + 1))}
                      disabled={historyPage >= totalHistoryPages - 1}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black border border-surface_light text-xs font-medium text-zinc-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Next
                      <Icon name="ChevronRight" size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-surface_light bg-surface/80 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-2.5 opacity-70">
            <div className="w-7 h-7 rounded-full bg-surface_light border border-white/5 flex items-center justify-center text-zinc-400">
              <Icon name="User" size={12} />
            </div>
            <div className="text-[11px] font-semibold text-white truncate max-w-[120px]">{settings.userName || 'Local User'}</div>
          </div>

          <button
            onClick={toggleSettings}
            className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary_hover transition-colors shadow-lg shadow-primary/10 active:scale-95 duration-100"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
