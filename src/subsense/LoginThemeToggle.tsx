import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme } from './theme';
import { Button } from './ui';

export default function LoginThemeToggle() {
  const [theme, setTheme] = useState(() => readTheme());
  useEffect(() => { applyTheme(theme, false); }, [theme]);
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;

  return (
    <Button
      aria-label={label}
      title={label}
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </Button>
  );
}
