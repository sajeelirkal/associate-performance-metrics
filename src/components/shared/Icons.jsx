export function GitHubIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function JiraIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M15.89 2.16L8.3 9.74a1.05 1.05 0 000 1.48l4.52 4.52 7.58-7.58-4.51-5.98z" fill="#2684FF"/>
      <path d="M16.11 29.84l7.59-7.58a1.05 1.05 0 000-1.48l-4.52-4.52-7.58 7.58 4.51 5.98z" fill="#2684FF"/>
      <path d="M8.3 9.74l-.01-.01A1.05 1.05 0 006.81 9.2L2 13.99a1.05 1.05 0 000 1.48l6.29 6.29 7.58-7.58-7.57-4.44z" fill="url(#jira_a)"/>
      <path d="M23.7 22.26l.01.01a1.05 1.05 0 001.48.53l4.81-4.79a1.05 1.05 0 000-1.48l-6.29-6.29-7.58 7.58 7.57 4.44z" fill="url(#jira_b)"/>
      <defs>
        <linearGradient id="jira_a" x1="9.13" y1="16" x2="2" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset=".18" stopColor="#0052CC"/><stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
        <linearGradient id="jira_b" x1="22.87" y1="16" x2="30" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset=".18" stopColor="#0052CC"/><stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

export function CalendarIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

export function GitLabIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 29.15L21.06 13.5H10.94L16 29.15Z" fill="#E24329"/>
      <path d="M16 29.15L10.94 13.5H3.28L16 29.15Z" fill="#FC6D26"/>
      <path d="M3.28 13.5L1.58 18.74a1.08 1.08 0 00.39 1.21L16 29.15 3.28 13.5Z" fill="#FCA326"/>
      <path d="M3.28 13.5h7.66L7.63 3.28a.54.54 0 00-1.03 0L3.28 13.5Z" fill="#E24329"/>
      <path d="M16 29.15L21.06 13.5h7.66L16 29.15Z" fill="#FC6D26"/>
      <path d="M28.72 13.5l1.7 5.24a1.08 1.08 0 01-.39 1.21L16 29.15l12.72-15.65Z" fill="#FCA326"/>
      <path d="M28.72 13.5h-7.66l3.31-10.22a.54.54 0 011.03 0l3.32 10.22Z" fill="#E24329"/>
    </svg>
  );
}
