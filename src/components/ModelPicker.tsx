import clsx from 'clsx';
import React, { useState } from 'react';

import { MODELS } from '../app/models';
import { Icon } from './shared/Icon';

interface ModelPickerProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ currentModel, onSelect, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = MODELS.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="absolute bottom-full left-0 mb-3 w-[380px] bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-fade-in origin-bottom-left select-none">
      <div className="p-3 border-b border-white/5">
        <div className="relative group">
          <Icon
            name="Search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-zinc-300 transition-colors"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/10 transition-colors"
            autoFocus
          />
          <Icon
            name="Filter"
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors"
          />
        </div>
      </div>

      <div className="overflow-y-auto max-h-[320px] p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        {filtered.map((model) => (
          <button
            key={model.id}
            onClick={() => {
              onSelect(model.id);
              onClose();
            }}
            className={clsx(
              'w-full flex items-start gap-3 p-3 rounded-xl transition-all group text-left border border-transparent',
              currentModel === model.id ? 'bg-white/10 border-white/5' : 'hover:bg-white/5',
            )}
          >
            <div className={clsx('flex-shrink-0 mt-0.5', model.color)}>
              <Icon name={model.icon as any} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'text-[13px] font-medium truncate',
                    currentModel === model.id ? 'text-white' : 'text-zinc-300 group-hover:text-white',
                  )}
                >
                  {model.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {model.premium && <Icon name="Gem" size={12} className="text-rose-500" />}
                  {model.isNew && <Icon name="Star" size={12} className="text-yellow-500" />}
                  {currentModel === model.id && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(225,29,72,0.8)]" />}
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 leading-relaxed line-clamp-1 mt-0.5 group-hover:text-zinc-400">{model.description}</div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="p-4 text-center text-xs text-zinc-600">No models found</div>}
      </div>
    </div>
  );
};
