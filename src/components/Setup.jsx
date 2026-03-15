import React, { useState } from 'react';
import { authAPI, saveToken, saveTeacher } from '../utils/api';
import './Setup.css';

function Setup({ onSetupComplete }) {
  const [form, setForm] = useState({ username: '', display_name: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (form.password.length < 4) {
      setError('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      const result = await authAPI.setup({
        username: form.username,
        password: form.password,
        display_name: form.display_name,
      });
      saveToken(result.token);
      saveTeacher(result.teacher);
      onSetupComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-container">
      <div className="setup-card">
        <div className="setup-header">
          <h1>학생 평가 관리 시스템</h1>
          <p>관리자 계정을 설정해주세요</p>
        </div>
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <label className="label">아이디</label>
            <input className="input" type="text" placeholder="예: teacher1"
              value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
              required autoFocus />
          </div>
          <div className="form-group">
            <label className="label">이름 (화면에 표시)</label>
            <input className="input" type="text" placeholder="예: 3학년 1반 김선생"
              value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })}
              required />
          </div>
          <div className="form-group">
            <label className="label">비밀번호</label>
            <input className="input" type="password" placeholder="비밀번호 (4자 이상)"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
              required />
          </div>
          <div className="form-group">
            <label className="label">비밀번호 확인</label>
            <input className="input" type="password" placeholder="비밀번호 재입력"
              value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })}
              required />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? '설정 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Setup;
