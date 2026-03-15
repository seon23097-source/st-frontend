import React, { useState, useRef } from 'react';
import { authAPI, saveToken, saveTeacher } from '../utils/api';
import './Login.css';

// 로컬스토리지에 배경 이미지 저장/불러오기
const BG_KEY = 'login_bg_image';
const loadBg = () => localStorage.getItem(BG_KEY) || null;
const saveBg = (dataUrl) => localStorage.setItem(BG_KEY, dataUrl);
const removeBg = () => localStorage.removeItem(BG_KEY);

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bgImage, setBgImage] = useState(loadBg);
  const fileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authAPI.login(form.username, form.password);
      saveToken(result.token);
      saveTeacher(result.teacher);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBgChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      saveBg(ev.target.result);
      setBgImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleBgRemove = () => {
    removeBg();
    setBgImage(null);
    fileRef.current.value = '';
  };

  return (
    <div className="login-page">
      {/* 왼쪽: 배경 이미지 영역 */}
      <div
        className="login-bg"
        style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
      >
        {!bgImage && (
          <div className="login-bg-placeholder">
            <div className="login-bg-icon">🏫</div>
            <p>학생 평가 관리 시스템</p>
          </div>
        )}
        {/* 배경 이미지 업로드 버튼 */}
        <div className="login-bg-controls">
          <button className="bg-ctrl-btn" onClick={() => fileRef.current.click()}>
            📷 배경 변경
          </button>
          {bgImage && (
            <button className="bg-ctrl-btn bg-ctrl-remove" onClick={handleBgRemove}>
              ✕ 제거
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleBgChange}
          />
        </div>
      </div>

      {/* 오른쪽: 로그인 폼 */}
      <div className="login-panel">
        <div className="login-form-wrap">
          <div className="login-logo">📚</div>
          <h1 className="login-title">학생 평가 관리</h1>
          <p className="login-subtitle">선생님 계정으로 로그인하세요</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label">아이디</label>
              <input
                className="login-input"
                type="text"
                placeholder="아이디를 입력하세요"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="login-field">
              <label className="login-label">비밀번호</label>
              <input
                className="login-input"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
