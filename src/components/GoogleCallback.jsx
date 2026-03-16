import React, { useEffect, useState } from 'react';
import { saveToken, saveTeacher } from '../utils/api';

export default function GoogleCallback({ onLogin }) {
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash; // #/auth/callback?token=...
    const search = hash.includes('?') ? hash.split('?')[1] : '';
    const params = new URLSearchParams(search);
    const token = params.get('token');
    const errorMsg = params.get('error');
    const displayName = params.get('display_name');

    if (errorMsg) {
      setError(decodeURIComponent(errorMsg));
      return;
    }

    if (token) {
      saveToken(token);
      const teacher = { display_name: displayName ? decodeURIComponent(displayName) : '선생님' };
      saveTeacher(teacher);
      onLogin(teacher);
    } else {
      setError('로그인 처리 중 오류가 발생했습니다.');
    }
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '40px' }}>⚠️</div>
        <p style={{ color: 'var(--danger)', fontSize: '16px' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.href = '/'}>돌아가기</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <div className="spinner"/>
      <p style={{ color: 'var(--text-secondary)' }}>로그인 처리 중...</p>
    </div>
  );
}
