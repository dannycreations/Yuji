import type { ReactNode } from 'react';

export const randomString = (size: number): string => {
  return Math.random()
    .toString(36)
    .slice(2, size + 2);
};

export const toTitleCase = (str: string): string => {
  return str
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const deepMerge = <A extends object, B = A>(target: A, source: B): A => {
  const result = { ...target };
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;

  Object.keys(source).forEach((key) => {
    const resultAs = result as Record<string, unknown>;
    const targetValue = resultAs[key];
    const sourceValue = (source as typeof resultAs)[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      resultAs[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      resultAs[key] = sourceValue;
    }
  });

  return result;
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
