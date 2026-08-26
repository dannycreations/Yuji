import clsx from 'clsx';
import { X } from 'lucide-react';

import type { FC } from 'react';
import type { Attachment } from '@yuji/client/app/Schema';

interface AttachmentGridProps {
  readonly attachments: readonly Attachment[];
  readonly onRemove?: (id: string) => void;
  readonly className?: string;
  readonly itemClassName?: string;
  readonly imgClassName?: string;
}

export const AttachmentGrid: FC<AttachmentGridProps> = ({
  attachments,
  onRemove,
  className = 'message-attachment-grid',
  itemClassName = 'message-attachment-item',
  imgClassName = 'message-attachment-img',
}) => {
  if (attachments.length === 0) return null;

  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {attachments.map((att) => (
        <div key={att.id} className={clsx('relative group', itemClassName)}>
          <img src={att.url} alt={att.name} className={clsx('object-cover rounded-lg border border-separator', imgClassName)} />
          {onRemove && (
            <button
              onClick={() => onRemove(att.id)}
              className="absolute -top-1.5 -right-1.5 bg-background border border-separator rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
