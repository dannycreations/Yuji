import { randomId } from './CommonUtil';

import type { Attachment } from '../app/Schema';

export const processImageFile = (file: File): Promise<Attachment> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    const url = URL.createObjectURL(file);
    const newAttachment: Attachment = {
      id: randomId(),
      type: 'image',
      url,
      name: file.name || 'Pasted Image',
    };
    resolve(newAttachment);
  });
};

export const handleFilesFromEvent = async (e: React.ChangeEvent<HTMLInputElement>): Promise<Attachment[]> => {
  if (!e.target.files) return [];
  const files = Array.from(e.target.files);
  const results = await Promise.allSettled(files.map(processImageFile));
  return results.filter((r): r is PromiseFulfilledResult<Attachment> => r.status === 'fulfilled').map((r) => r.value);
};

export const handleFilesFromPaste = async (e: React.ClipboardEvent): Promise<Attachment[]> => {
  const items = e.clipboardData?.items;
  if (!items) return [];

  const filePromises: Promise<Attachment>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        filePromises.push(processImageFile(file));
      }
    }
  }

  const results = await Promise.allSettled(filePromises);
  return results.filter((r): r is PromiseFulfilledResult<Attachment> => r.status === 'fulfilled').map((r) => r.value);
};
