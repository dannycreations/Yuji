import type { ReactNode } from 'react';

export const uuid = () => crypto.randomUUID();

export const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  const msg = (err as { message?: string })?.message;
  return msg || JSON.stringify(err);
};

export const randomId = (size: number = 8): string => {
  return uuid().replace(/-/g, '').slice(0, size);
};

export const getFirstChar = (str: string): string => {
  return str ? str.trim().charAt(0).toUpperCase() : '';
};

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return str.slice(0, length).trim() + '...';
};

export const toTitleCase = (str: string): string => {
  return str
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const parseBoldText = (text: string): (string | ReactNode)[] => {
  return text.split(/(\*\*.*?\*\*)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export const downloadFile = (content: string, filename: string, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
