import { useCallback, useState } from 'react';

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

const handleFilesFromEvent = async (e: React.ChangeEvent<HTMLInputElement>): Promise<Attachment[]> => {
  if (!e.target.files) return [];
  return settleAttachments(Array.from(e.target.files).map(processImageFile));
};

const handleFilesFromPaste = async (e: React.ClipboardEvent): Promise<Attachment[]> => {
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

export const useAttachment = (initialAttachments: readonly Attachment[] = []) => {
  const [attachments, setAttachments] = useState<readonly Attachment[]>(initialAttachments);

  const onFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAttachments = await handleFilesFromEvent(e);
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const onPaste = useCallback(async (e: React.ClipboardEvent) => {
    const newAttachments = await handleFilesFromPaste(e);
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    setAttachments,
    onFileSelect,
    onPaste,
    removeAttachment,
    clearAttachments,
  };
};
