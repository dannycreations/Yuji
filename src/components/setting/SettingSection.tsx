import { Icon } from '../shared/Icon';
import { InputText, InputTextarea } from '../shared/InputArea';

import type { FC } from 'react';
import type { Instruction, Personalisation } from '../../app/Schema';

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
