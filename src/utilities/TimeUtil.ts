const INTERVALS = [
  { label: 'year', seconds: 31536000 },
  { label: 'month', seconds: 2592000 },
  { label: 'day', seconds: 86400 },
  { label: 'hour', seconds: 3600 },
  { label: 'minute', seconds: 60 },
] as const;

export const timeAgo = (timestamp: number): string => {
  const diffSeconds = (Date.now() - timestamp) / 1000;
  if (diffSeconds < 60) {
    return 'just now';
  }

  for (let i = 0, len = INTERVALS.length; i < len; i++) {
    const { label, seconds } = INTERVALS[i];
    if (diffSeconds >= seconds) {
      const count = Math.floor(diffSeconds / seconds);
      return `${count} ${label}${count > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
};
