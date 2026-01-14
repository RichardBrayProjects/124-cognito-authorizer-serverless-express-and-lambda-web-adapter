import { useState } from 'react';

export function useDarkness() {
  // Load initial theme from localStorage (default = light/false)
  const initial = localStorage.getItem('theme') === 'dark';

  const [dark, setDarkState] = useState(initial);

  // Wrap setDark so it updates state, localStorage, and <html> class
  const setDark = (value: boolean) => {
    setDarkState(value);
    localStorage.setItem('theme', value ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', value);
  };

  // Ensure the correct theme is applied on initial load
  document.documentElement.classList.toggle('dark', initial);

  return [dark, setDark] as const;
}
