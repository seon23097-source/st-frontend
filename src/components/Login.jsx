import React, { useState } from 'react';
import { authAPI, saveToken, saveTeacher } from '../utils/api';

const BACKEND_URL = 'https://st.looool.xyz';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.login(username, password);
      saveToken(data.token);
      saveTeacher(data.teacher);
      onLogin(data.teacher);
    } catch (err) {
      setError(err.message || '로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/google`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-tertiary)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        padding: '40px',
        width: '360px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏫</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>학생 평가 관리</h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>로그인이 필요합니다</p>
        </div>

        {/* 구글 로그인 버튼 */}
        <button
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '20px',
            transition: 'var(--transition)',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
          onMouseLeave={e => e.currentTarget.style.background = 'white'}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          Google로 로그인
        </button>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }}/>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>또는</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }}/>
        </div>

        {/* 기존 로그인 */}
        <div>
          <div style={{ marginBottom: '14px' }}>
            <input
              className="input"
              type="text"
              placeholder="아이디"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input
              className="input"
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{ width: '100%' }}
            />
          </div>
          {error && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', fontSize: '13px', color: '#dc2626' }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={handleLogin}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
