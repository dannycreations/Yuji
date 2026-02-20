import { Plus } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';

import { InputButton } from './InputArea';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, ComponentProps } from 'react';

interface FilePickerProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'ref'> {
  readonly onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly icon?: LucideIcon;
  readonly iconSize?: number;
  readonly buttonClassName?: string;
  readonly buttonVariant?: ComponentProps<typeof InputButton>['variant'];
}

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(
  ({ onFileSelect, icon: IconComponent = Plus, iconSize = 22, buttonClassName = 'p-1!', buttonVariant = 'ghost', title, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    return (
      <>
        <input type="file" className="hidden" ref={internalRef} onChange={onFileSelect} {...props} />
        <InputButton onClick={() => internalRef.current?.click()} title={title} className={buttonClassName} variant={buttonVariant}>
          <IconComponent size={iconSize} />
        </InputButton>
      </>
    );
  },
);
