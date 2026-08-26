import { Cause } from 'effect';

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

export const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
};
