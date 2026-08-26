import { randomId } from '@yuji/client/utilities/CommonUtil';

import type { Attachment } from '@yuji/client/app/Schema';

const processImageFile = async (file: File): Promise<Attachment> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('File is not an image');
  }

  return {
    id: randomId(),
    type: 'image',
    url: URL.createObjectURL(file),
    name: file.name || 'Pasted Image',
  };
};

const settleAttachments = async (files: readonly Promise<Attachment>[]): Promise<Attachment[]> => {
  const results = await Promise.allSettled(files);
  return results.filter((r): r is PromiseFulfilledResult<Attachment> => r.status === 'fulfilled').map((r) => r.value);
};

export const handleFilesFromEvent = async (e: React.ChangeEvent<HTMLInputElement>): Promise<Attachment[]> => {
  if (!e.target.files) return [];
  return settleAttachments(Array.from(e.target.files).map(processImageFile));
};

export const handleFilesFromPaste = async (e: React.ClipboardEvent): Promise<Attachment[]> => {
  const items = e.clipboardData?.items;
  if (!items) return [];

  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  return settleAttachments(files.map(processImageFile));
};
