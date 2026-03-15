import { useEffect, useState } from 'react';

// ── 테마 정의 ──────────────────────────────────────────────
// sidebar-bg는 사이드바 배경, pattern은 기하학적 패턴 SVG dataURI
const THEMES = [
  {
    key: 'blue',
    label: '블루',
    swatch: '#6B7FC4',
    pattern: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='2' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E")`,
  },
  {
    key: 'purple',
    label: '퍼플',
    swatch: '#8B7AB0',
    pattern: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l12 12L24 0' stroke='rgba(255,255,255,0.07)' fill='none' stroke-width='1'/%3E%3C/svg%3E")`,
  },
  {
    key: 'mint',
    label: '민트',
    swatch: '#5A9B7D',
    pattern: `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='6' y='6' width='4' height='4' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E")`,
  },
  {
    key: 'dark',
    label: '다크',
    swatch: '#1F2937',
    pattern: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10h20M10 0v20' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3C/svg%3E")`,
  },
  {
    key: 'rose',
    label: '로즈',
    swatch: '#C2697A',
    pattern: `url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l9 9M9 9l9-9M0 18l9-9M9 9l9 9' stroke='rgba(255,255,255,0.08)' fill='none' stroke-width='1'/%3E%3C/svg%3E")`,
  },
  {
    key: 'slate',
    label: '슬레이트',
    swatch: '#4A6FA5',
    pattern: `url("data:image/svg+xml,%3Csvg width='22' height='22' viewBox='0 0 22 22' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='11,2 20,20 2,20' fill='none' stroke='rgba(255,255,255,0.07)' stroke-width='1'/%3E%3C/svg%3E")`,
  },
  {
    key: 'forest',
    label: '포레스트',
    swatch: '#3D6B4F',
    pattern: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='4' cy='4' r='2' fill='rgba(255,255,255,0.07)'/%3E%3Ccircle cx='14' cy='14' r='2' fill='rgba(255,255,255,0.07)'/%3E%3C/svg%3E")`,
  },
  {
    key: 'amber',
    label: '앰버',
    swatch: '#A0692A',
    pattern: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='10' height='10' fill='rgba(255,255,255,0.05)'/%3E%3Crect x='10' y='10' width='10' height='10' fill='rgba(255,255,255,0.05)'/%3E%3C/svg%3E")`,
  },
];

function ThemeSelector() {
  const [theme, setTheme] = useState('blue');

  useEffect(() => {
    const saved = localStorage.getItem('preferred-theme') || 'blue';
    setTheme(saved);
    applyTheme(saved, false);
  }, []);

  const applyTheme = (key, save = true) => {
    if (key === 'blue') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', key);
    }
    if (save) {
      localStorage.setItem('preferred-theme', key);
      setTheme(key);
    }
  };

  return (
    <div className="theme-selector-sidebar">
      <div className="theme-selector-label">테마</div>
      <div className="theme-swatches">
        {THEMES.map(t => (
          <button
            key={t.key}
            className={`theme-swatch ${theme === t.key ? 'active' : ''}`}
            style={{ background: t.swatch }}
            title={t.label}
            onClick={() => applyTheme(t.key)}
          >
            {theme === t.key && <span className="theme-swatch-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ThemeSelector;
