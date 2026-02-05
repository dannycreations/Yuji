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
    const targetValue = (result as any)[key];
    const sourceValue = (source as any)[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      (result as any)[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      (result as any)[key] = sourceValue;
    }
  });

  return result;
};
