import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Setup from './components/Setup';
import Login from './components/Login';
import InitialSetup from './components/InitialSetup';
import Dashboard from './components/Dashboard';
import { authAPI, studentsAPI, isAuthenticated, saveTeacher } from './utils/api';

// 🎨 테마 CSS 변수 주입
const injectThemeVariables = () => {
  const style = document.createElement('style');
  style.id = 'theme-variables';
  style.textContent = `
    :root {
      --primary: #7BA7BC;
      --primary-light: #A8C8D8;
      --primary-dark: #5A8A9F;
      --primary-bg: #EBF4F8;
      --accent: #B5A4D4;
      --accent-light: #D4C9E8;
      --accent-bg: #F2EEFA;
      --success: #88C9A1;
      --success-bg: #EDFAF3;
      --warning: #F0C987;
      --warning-bg: #FEF8EC;
      --danger: #E89090;
      --danger-bg: #FDEAEA;
      --info: #7BB5E0;
      --text-primary: #3A3A4A;
      --text-secondary: #6B6B80;
      --text-tertiary: #9999AA;
      --text-on-dark: #FFFFFF;
      --bg-primary: #FFFFFF;
      --bg-secondary: #F7F5FF;
      --bg-tertiary: #EEEAF8;
      --bg-hover: #E8E4F4;
      --border-light: #E4E0F0;
      --border-medium: #CCC8DC;
      --shadow-sm: 0 1px 4px rgba(100,90,160,0.08);
      --shadow-md: 0 4px 12px rgba(100,90,160,0.10);
      --shadow-lg: 0 10px 30px rgba(100,90,160,0.14);
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --transition: all 0.2s ease;
      --sidebar-bg: #6B7FC4;
      --sidebar-dark: #5A6DB0;
    }
    
    [data-theme="purple"] {
      --primary: #B5A4D4;
      --primary-light: #D4C9E8;
      --primary-dark: #9B8AB8;
      --sidebar-bg: #8B7AB0;
      --accent: #E89DB7;
      --accent-light: #F5C5D8;
    }
    
    [data-theme="mint"] {
      --primary: #88C9A1;
      --primary-light: #B0E0C5;
      --primary-dark: #6BA885;
      --sidebar-bg: #5A9B7D;
      --accent: #7BB5E0;
      --accent-light: #A8D3F0;
    }
    
    [data-theme="dark"] {
      --text-primary: #E8E8F0;
      --text-secondary: #B0B0C8;
      --text-tertiary: #8888A0;
      --bg-primary: #2A2A3A;
      --bg-secondary: #1A1A28;
      --bg-tertiary: #323244;
      --bg-hover: #3A3A4C;
      --border-light: #404050;
      --border-medium: #505060;
      --primary: #A8C8D8;
      --sidebar-bg: #1F2937;
      --sidebar-dark: #111827;
    }

    [data-theme="rose"] {
      --primary: #C2697A; --primary-light: #E0A0AC; --primary-dark: #A04F60;
      --primary-bg: #FDEEF0;
      --sidebar-bg: #C2697A; --sidebar-dark: #A04F60;
      --accent: #E8A87C; --accent-light: #F5CCB0; --accent-bg: #FEF3EA;
    }

    [data-theme="slate"] {
      --primary: #4A6FA5; --primary-light: #7A9CC8; --primary-dark: #2E5280;
      --primary-bg: #EAF0F8;
      --sidebar-bg: #4A6FA5; --sidebar-dark: #2E5280;
      --accent: #7BADC8; --accent-light: #A8CCE0;
    }

    [data-theme="forest"] {
      --primary: #3D6B4F; --primary-light: #6A9E7A; --primary-dark: #285238;
      --primary-bg: #E8F5EC;
      --sidebar-bg: #3D6B4F; --sidebar-dark: #285238;
      --accent: #88B89A; --accent-light: #B0D4BE;
    }

    [data-theme="amber"] {
      --primary: #A0692A; --primary-light: #C89450; --primary-dark: #7A4E18;
      --primary-bg: #FDF4E7;
      --sidebar-bg: #A0692A; --sidebar-dark: #7A4E18;
      --accent: #D4A860; --accent-light: #ECC890;
    }

    body {
      background: var(--bg-secondary);
      color: var(--text-primary);
      min-height: 100vh;
    }
  `;
  
  // 기존 스타일 제거 후 새로 추가
  const existing = document.getElementById('theme-variables');
  if (existing) existing.remove();
  document.head.appendChild(style);
};

function AppContent() {
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
    injectThemeVariables(); // 👈 테마 변수 주입

  // 👇 디버깅 코드 추가
  setTimeout(() => {
    const root = getComputedStyle(document.documentElement);
    console.log('✅ CSS 변수 확인:');
    console.log('--primary:', root.getPropertyValue('--primary'));
    console.log('--bg-secondary:', root.getPropertyValue('--bg-secondary'));
    console.log('--text-primary:', root.getPropertyValue('--text-primary'));
    
    const styleTag = document.getElementById('theme-variables');
    console.log('✅ Style 태그 존재:', !!styleTag);
    if (styleTag) {
      console.log('✅ Style 내용:', styleTag.textContent.substring(0, 200));
    }
  }, 1000);

    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { hasPassword } = await authAPI.checkSetup();
      if (!hasPassword) {
        setAuthState('setup');
        return;
      }
      if (!isAuthenticated()) {
        setAuthState('login');
        return;
      }
      try {
        const { teacher } = await authAPI.me();
        saveTeacher(teacher);
        const countData = await studentsAPI.getCount();
        if (countData.count === 0) {
          setAuthState('initial-setup');
        } else {
          setAuthState('ready');
          // 로그인 후 첫 화면: 오늘
          if (window.location.pathname === '/' || window.location.pathname === '') {
            window.history.replaceState(null, '', '/today');
          }
        }
      } catch {
        setAuthState('login');
      }
    } catch {
      setAuthState('login');
    }
  };

  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (authState === 'setup') return <Setup onSetupComplete={() => setAuthState('initial-setup')} />;
  if (authState === 'login') return <Login onLogin={() => checkAuth()} />;
  if (authState === 'initial-setup') return <InitialSetup onComplete={() => setAuthState('ready')} />;

  return (
    <Routes>
      <Route path="/*" element={<Dashboard />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

export default App;