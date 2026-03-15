import React, { useState } from 'react';
import './Today.css';

const DAY_KR = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
function getTodayInfo() {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate(), dow: DAY_KR[now.getDay()], year: now.getFullYear() };
}
const todayKey = new Date().toISOString().slice(0, 10);

function QuickMemo() {
  const key = `today_memo_${todayKey}`;
  const [memo, setMemo] = useState(() => localStorage.getItem(key) || '');
  return (
    <div className="today-card">
      <div className="today-card-title">📌 오늘의 메모</div>
      <textarea className="today-textarea" placeholder="수업 내용, 준비물, 할 일 등 자유롭게 메모하세요."
        value={memo} onChange={e => { setMemo(e.target.value); localStorage.setItem(key, e.target.value); }} />
    </div>
  );
}

function TodoList() {
  const key = `today_todos_${todayKey}`;
  const [todos, setTodos] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } });
  const [input, setInput] = useState('');
  function save(next) { setTodos(next); localStorage.setItem(key, JSON.stringify(next)); }
  function add() {
    if (!input.trim()) return;
    save([...todos, { id: Date.now(), text: input.trim(), done: false }]);
    setInput('');
  }
  return (
    <div className="today-card">
      <div className="today-card-title">✅ 오늘 할일</div>
      <div className="todo-row">
        <input className="todo-input" placeholder="할일 입력 후 Enter" value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="todo-add" onClick={add}>추가</button>
      </div>
      <ul className="todo-list">
        {todos.length === 0 && <li className="todo-empty">오늘 할일이 없어요 🎉</li>}
        {todos.map(t => (
          <li key={t.id} className={`todo-item${t.done ? ' done' : ''}`}>
            <button className="todo-check" onClick={() => save(todos.map(x => x.id === t.id ? {...x, done: !x.done} : x))}>{t.done ? '☑' : '☐'}</button>
            <span className="todo-text">{t.text}</span>
            <button className="todo-del" onClick={() => save(todos.filter(x => x.id !== t.id))}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoticeWidget() {
  const key = `today_notice_${todayKey}`;
  const [text, setText] = useState(() => localStorage.getItem(key) || '');
  const tagColors = { '제출': '#ef4444', '준비물': '#f59e0b', '회신': '#3b82f6' };
  const parsed = [];
  const re = /\[([^\]]+)\]\s*([^[\n]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1].trim(), content = m[2].trim();
    if (content) parsed.push({ tag, content });
  }
  return (
    <div className="today-card notice-wide">
      <div className="today-card-title">📢 알림장 키워드</div>
      <textarea className="today-textarea" placeholder="예: [제출] 독서록  [준비물] 색연필  [회신] 동의서"
        value={text} onChange={e => { setText(e.target.value); localStorage.setItem(key, e.target.value); }} />
      {parsed.length > 0 && (
        <div className="notice-parsed">
          <div className="notice-parsed-title">파싱 결과</div>
          {parsed.map((item, i) => (
            <div key={i} className="notice-item">
              <span className="notice-tag" style={{ background: tagColors[item.tag] || '#64748b' }}>{item.tag}</span>
              <span className="notice-content">{item.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Today() {
  const { month, day, dow, year } = getTodayInfo();
  return (
    <div className="today-page">
      <div className="today-header">
        <span className="today-md">{month}월 {day}일</span>
        <span className="today-dow">{dow}</span>
        <span className="today-year">{year}년</span>
      </div>
      <div className="today-grid">
        <QuickMemo />
        <TodoList />
        <NoticeWidget />
      </div>
    </div>
  );
}
