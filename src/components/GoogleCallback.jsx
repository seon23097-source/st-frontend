import React, { useEffect, useState } from 'react';
import { saveToken, saveTeacher } from '../utils/api';

export default function GoogleCallback({ onLogin }) {
  const [error, setError] = useState('');

  useEffect(() => {
    // window.location.href 전체에서 파싱
    const href = window.location.href;
    const queryStart = href.indexOf('?');
    if (queryStart === -1) {
      setError('잘못된 콜백 URL입니다.');
      return;
    }
    const params = new URLSearchParams(href.slice(queryStart));
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
      setError('토큰이 없습니다.');
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
