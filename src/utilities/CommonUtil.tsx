import { Cause } from 'effect';

import type { ReactNode } from 'react';

export const formatError = (err: unknown): string => {
  if (Cause.isCause(err)) return Cause.pretty(err);
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return (err as { readonly message?: string })?.message ?? JSON.stringify(err);
};

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const randomId = (size: number = 8): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (let i = 0; i < size; i++) {
    id += ID_CHARS[bytes[i] % 36];
  }
  return id;
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
  if (!text.includes('**')) return [text];
  return text.split(/(\*\*.*?\*\*)/).map((part, i) => {
    if (part.length > 4 && part[0] === '*' && part[1] === '*' && part[part.length - 2] === '*' && part[part.length - 1] === '*') {
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
