import React, { useState, useEffect, useRef, useCallback } from 'react';
import { todayAPI } from '../utils/api';
import './Today.css';

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDate(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(s, n) { const d=parseDate(s); d.setDate(d.getDate()+n); return dateStr(d); }

// ── 미니 달력 ──────────────────────────────────
function MiniCalendar({ selected, onSelect, onClose }) {
  const d = parseDate(selected);
  const [vy, setVY] = useState(d.getFullYear());
  const [vm, setVM] = useState(d.getMonth());
  const today = dateStr(new Date());
  const firstDow = new Date(vy, vm, 1).getDay();
  const lastDay = new Date(vy, vm+1, 0).getDate();
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let i=1;i<=lastDay;i++) cells.push(i);
  function pick(day) {
    const s = `${vy}-${String(vm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onSelect(s); onClose();
  }
  return (
    <div className="mini-cal-popup">
      <div className="mini-cal-nav">
        <button onClick={()=>{if(vm===0){setVY(y=>y-1);setVM(11);}else setVM(m=>m-1)}}>◀</button>
        <span>{vy}년 {vm+1}월</span>
        <button onClick={()=>{if(vm===11){setVY(y=>y+1);setVM(0);}else setVM(m=>m+1)}}>▶</button>
      </div>
      <div className="mini-cal-grid">
        {DAY_KR.map(d=><div key={d} className={`mc-dow ${d==='일'?'sun':d==='토'?'sat':''}`}>{d}</div>)}
        {cells.map((day,i)=>{
          if(!day) return <div key={`e${i}`}/>;
          const s=`${vy}-${String(vm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          return (
            <button key={day} className={`mc-day ${s===selected?'selected':''} ${s===today?'today':''} ${new Date(vy,vm,day).getDay()===0?'sun':new Date(vy,vm,day).getDay()===6?'sat':''}`}
              onClick={()=>pick(day)}>{day}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── 메모 ──────────────────────────────────────
function QuickMemo({ date }) {
  const [memo, setMemo] = useState('');
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    setLoaded(false);
    todayAPI.getMemo(date).then(r=>{ setMemo(r.content||''); setLoaded(true); }).catch(()=>setLoaded(true));
  }, [date]);
  const handleChange = (val) => {
    setMemo(val);
    if(timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(()=>todayAPI.saveMemo(date, val), 800);
  };
  return (
    <div className="today-card today-card-memo">
      <div className="today-card-title">📌 메모</div>
      <textarea className="today-textarea" placeholder="수업 내용, 준비물, 기억할 것..."
        value={memo} onChange={e=>handleChange(e.target.value)} disabled={!loaded}/>
    </div>
  );
}

// ── 할일 ──────────────────────────────────────
function TodoList({ date }) {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTodos(await todayAPI.getTodos(date)); } catch{}
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // 날짜 바뀔 때 전날 미완료 자동 이월
  useEffect(() => {
    const prev = addDays(date, -1);
    todayAPI.carryOver(prev, date).catch(()=>{});
  }, [date]);

  const add = async () => {
    if(!input.trim()) return;
    await todayAPI.addTodo(date, input.trim());
    setInput(''); load();
  };
  const toggle = async (id) => { await todayAPI.toggleTodo(id); load(); };
  const del = async (id) => { await todayAPI.deleteTodo(id); load(); };

  const undone = todos.filter(t=>!t.done);
  const done   = todos.filter(t=>t.done);

  return (
    <div className="today-card today-card-todo">
      <div className="today-card-title">
        ✅ 할일
        {todos.length>0&&<span className="todo-badge">{undone.length}/{todos.length}</span>}
      </div>
      <div className="todo-row">
        <input className="todo-input" placeholder="할일 추가 (Enter)" value={input}
          onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/>
        <button className="todo-add" onClick={add}>+</button>
      </div>
      <ul className="todo-list">
        {!loading && todos.length===0 && <li className="todo-empty">할일이 없어요 🎉</li>}
        {undone.map(t=>(
          <li key={t.id} className="todo-item">
            <button className="todo-check" onClick={()=>toggle(t.id)}>☐</button>
            <span className="todo-text">{t.text}</span>
            {t.original_id&&<span className="todo-carried" title="이전 날에서 이월됨">↩</span>}
            <button className="todo-del" onClick={()=>del(t.id)}>×</button>
          </li>
        ))}
        {done.length>0&&<li className="todo-divider">완료</li>}
        {done.map(t=>(
          <li key={t.id} className="todo-item done">
            <button className="todo-check" onClick={()=>toggle(t.id)}>☑</button>
            <span className="todo-text">{t.text}</span>
            <button className="todo-del" onClick={()=>del(t.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 알림장 ──────────────────────────────────────
function NoticeWidget({ date }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    setLoaded(false);
    todayAPI.getNotice(date).then(r=>{ setText(r.content||''); setLoaded(true); }).catch(()=>setLoaded(true));
  }, [date]);
  const handleChange = (val) => {
    setText(val);
    if(timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(()=>todayAPI.saveNotice(date, val), 800);
  };
  const tagColors = { '제출':'#ef4444','준비물':'#f59e0b','회신':'#3b82f6','공지':'#8b5cf6','행사':'#10b981' };
  const parsed = [];
  const re = /\[([^\]]+)\]\s*([^[\n]*)/g;
  let m;
  while((m=re.exec(text))!==null){ const tag=m[1].trim(),content=m[2].trim(); if(content) parsed.push({tag,content}); }
  return (
    <div className="today-card today-card-notice">
      <div className="today-card-title">📢 알림장</div>
      <textarea className="today-textarea" placeholder={"[제출] 독서록\n[준비물] 색연필\n[회신] 동의서"}
        value={text} onChange={e=>handleChange(e.target.value)} disabled={!loaded}/>
      {parsed.length>0&&(
        <div className="notice-parsed">
          {parsed.map((item,i)=>(
            <div key={i} className="notice-item">
              <span className="notice-tag" style={{background:tagColors[item.tag]||'#64748b'}}>{item.tag}</span>
              <span className="notice-content">{item.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────
export default function Today() {
  const todayStr = dateStr(new Date());
  const [selected, setSelected] = useState(todayStr);
  const [showCal, setShowCal] = useState(false);
  const calRef = useRef(null);

  const d = parseDate(selected);
  const month = d.getMonth()+1;
  const day   = d.getDate();
  const dow   = DAY_FULL[d.getDay()];
  const isToday = selected === todayStr;

  useEffect(() => {
    function handleClick(e){ if(calRef.current&&!calRef.current.contains(e.target)) setShowCal(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="today-page">
      {/* 헤더 */}
      <div className="today-header">
        <div className="today-header-left">
          <button className="today-nav-btn" onClick={()=>setSelected(addDays(selected,-1))}>◀</button>
          <div className="today-date-info">
            <span className="today-md">{month}월 {day}일</span>
            <span className="today-dow">{dow}</span>
            {!isToday&&<span className="today-not-today" onClick={()=>setSelected(todayStr)}>오늘로</span>}
          </div>
          <button className="today-nav-btn" onClick={()=>setSelected(addDays(selected,1))}>▶</button>
        </div>
        <div className="today-header-right" ref={calRef}>
          <button className="today-cal-btn" onClick={()=>setShowCal(p=>!p)}>📅 {selected}</button>
          {showCal&&<MiniCalendar selected={selected} onSelect={setSelected} onClose={()=>setShowCal(false)}/>}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="today-grid">
        <QuickMemo date={selected}/>
        <TodoList date={selected}/>
        <NoticeWidget date={selected}/>
      </div>
    </div>
  );
}
