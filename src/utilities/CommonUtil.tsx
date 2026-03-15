import { Cause } from 'effect';

import type { ReactNode } from 'react';

export const randomId = (size: number = 8): string => crypto.randomUUID().slice(0, size);

export const getFirstChar = (str: string): string => {
  const trimmed = str.trim();
  if (!trimmed) {
    return '';
  }

  const first = trimmed.codePointAt(0);
  return first ? String.fromCodePoint(first).toUpperCase() : '';
};

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) {
    return str;
  }

  return str.slice(0, length).trim() + '...';
};

export const toTitleCase = (str: string): string => {
  let result = '';
  let capitalizeNext = true;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '-' || char === '_' || char === ' ') {
      if (result.length > 0 && result[result.length - 1] !== ' ') {
        result += ' ';
      }
      capitalizeNext = true;
    } else {
      result += capitalizeNext ? char.toUpperCase() : char.toLowerCase();
      capitalizeNext = false;
    }
  }

  return result;
};

export const parseBoldText = (text: string): (string | ReactNode)[] => {
  const len = text.length;
  if (len < 5) return [text];

  const firstIdx = text.indexOf('**');
  if (firstIdx === -1 || firstIdx > len - 4) return [text];

  const results: (string | ReactNode)[] = [];
  let lastIndex = 0;

  // Manual fast-path iteration instead of regex split + map
  while (lastIndex < len) {
    const start = text.indexOf('**', lastIndex);
    if (start === -1 || start > len - 4) {
      results.push(text.slice(lastIndex));
      break;
    }

    const end = text.indexOf('**', start + 2);
    if (end === -1) {
      results.push(text.slice(lastIndex));
      break;
    }

    if (start > lastIndex) {
      results.push(text.slice(lastIndex, start));
    }

    results.push(<strong key={start}>{text.slice(start + 2, end)}</strong>);
    lastIndex = end + 2;
  }

  return results;
};

export const formatError = (err: unknown): string => {
  if (Cause.isCause(err)) {
    return Cause.pretty(err);
  }

  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  const msg = (err as { readonly message?: string })?.message;
  if (msg) return msg;

  return JSON.stringify(err);
};

export const downloadFile = (content: string, filename: string, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};
