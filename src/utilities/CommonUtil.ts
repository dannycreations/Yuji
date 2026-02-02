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
