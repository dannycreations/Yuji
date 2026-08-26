export const getGreeting = (userName: string): string => {
  const firstName = userName.trim().split(/\s+/)[0] || '';
  return firstName ? `How can I help you, ${firstName}?` : 'How can I help you today?';
};
