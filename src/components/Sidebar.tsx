import React, { useMemo, useState } from 'react';

import { ChatSession } from '../app/types';
import { useStore } from '../stores/useStore';
import { Icon } from './Icon';

export const Sidebar: React.FC = () => {
  const { sessions, activeSessionId, setActiveSession, createSession, deleteSession, isSidebarOpen, toggleSidebar, toggleSettings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSessions = useMemo(() => {
    const allSessions = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchTerm.trim()) return allSessions;
    return allSessions.filter((session) => session.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [sessions, searchTerm]);

  const groupSessions = (sessionsList: ChatSession[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Record<string, ChatSession[]> = {
      Today: [],
      Yesterday: [],
      Recent: [],
      Older: [],
    };

    sessionsList.forEach((session) => {
      const date = new Date(session.updatedAt);
      if (date.toDateString() === today.toDateString()) {
        groups['Today'].push(session);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups['Yesterday'].push(session);
      } else if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        groups['Recent'].push(session);
      } else {
        groups['Older'].push(session);
      }
    });

    return groups;
  };

  const groupedSessions = groupSessions(filteredSessions);

  if (!isSidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-20 p-1.5 bg-surface text-zinc-400 hover:text-white rounded-lg shadow-lg border border-surface_light transition-colors"
      >
        <Icon name="PanelLeftOpen" size={18} />
      </button>
    );
  }

  return (
    <div className="w-72 h-screen bg-black flex flex-col border-r border-surface_light flex-shrink-0 relative z-10 transition-all duration-300">
      <div className="p-3.5 flex items-center justify-between">
        <button onClick={toggleSidebar} className="text-zinc-500 hover:text-white transition-colors p-1">
          <Icon name="PanelLeftClose" size={18} />
        </button>
        <button onClick={() => createSession()} className="p-1 text-zinc-500 hover:text-white transition-colors" title="New Chat">
          <Icon name="SquarePen" size={18} />
        </button>
      </div>

      <div className="px-3.5 pb-4">
        <div className="relative group">
          <Icon
            name="Search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-400 transition-colors"
          />
          <input
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface_light/30 text-xs text-zinc-200 pl-9 pr-3 py-2 rounded-lg border border-transparent focus:bg-surface_light/50 focus:border-zinc-800 outline-none transition-all placeholder:text-zinc-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {Object.entries(groupedSessions).map(
          ([label, group]) =>
            group.length > 0 && (
              <div key={label} className="px-1">
                <h3 className="text-[10px] font-bold text-zinc-600 mb-1.5 px-2.5 uppercase tracking-widest">{label}</h3>
                <div className="space-y-0.5">
                  {group.map((session) => (
                    <div
                      key={session.id}
                      className={`group relative flex items-center rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                        activeSessionId === session.id ? 'bg-surface_light text-white' : 'text-zinc-500 hover:bg-surface_light/40 hover:text-zinc-300'
                      }`}
                      onClick={() => setActiveSession(session.id)}
                    >
                      <span className="truncate flex-1 pr-6 font-medium">{session.title}</span>
                      <button
                        className={`absolute right-2 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity`}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                      >
                        <Icon name="Trash2" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      <div className="p-3 border-t border-surface_light bg-black">
        <button
          onClick={toggleSettings}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-zinc-500 hover:bg-surface_light/50 hover:text-white transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <Icon name="User" size={14} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-[11px] font-bold truncate">Local User</div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-tighter">Personal Space</div>
          </div>
          <Icon name="Settings" size={14} />
        </button>
      </div>
    </div>
  );
};
