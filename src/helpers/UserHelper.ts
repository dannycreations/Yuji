import { INITIAL_GREETING } from '../app/Constant';

export const getFirstName = (fullName: string): string => {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
};

export const getGreeting = (userName: string): string => {
  const firstName = getFirstName(userName);
  const replacement = firstName ? `, ${firstName}` : ' today';
  return INITIAL_GREETING.replace('{{0}}', replacement);
};
