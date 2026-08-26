import { useCallback, useState } from 'react';

import { handleFilesFromEvent, handleFilesFromPaste } from '@yuji/client/utilities/FileUtil';

import type { Attachment } from '@yuji/client/app/Schema';

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
