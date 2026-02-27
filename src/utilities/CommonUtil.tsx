import { Cause } from 'effect';

import type { ReactNode } from 'react';

export const randomId = (size: number = 8): string => crypto.randomUUID().slice(0, size);

export const getFirstChar = (str: string): string => {
  const trimmed = str.trim();
  if (!trimmed) return '';
  const first = trimmed.codePointAt(0);
  return first ? String.fromCodePoint(first).toUpperCase() : '';
};

export const truncate = (str: string, length: number): string => {
  return str.length <= length ? str : str.slice(0, length).trim() + '...';
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

export const formatError = (err: unknown): string => {
  if (Cause.isCause(err)) return Cause.pretty(err);
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return (err as { readonly message?: string })?.message ?? JSON.stringify(err);
};

export const downloadFile = (content: string, filename: string, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
