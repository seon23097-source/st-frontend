import React, { useState, useEffect, useCallback } from 'react';
import { studentsAPI, attendanceAPI, currentSchoolYear } from '../utils/api';
import './Attendance.css';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────
const ABSENCE_TYPES = [
  { key: null,       label: '출석',     short: '',   color: 'transparent' },
  { key: 'field',    label: '체험학습', short: '체', color: '#3b82f6' },
  { key: 'approved', label: '출석인정', short: '인', color: '#8b5cf6' },
  { key: 'sick',     label: '병결',     short: '병', color: '#ef4444' },
  { key: 'early',    label: '조퇴',     short: '조', color: '#f59e0b' },
  { key: 'other',    label: '기타',     short: '기', color: '#6b7280' },
];
const TYPE_ORDER  = [null, 'field', 'approved', 'sick', 'early', 'other'];
const DOW_SHORT   = ['일','월','화','수','목','금','토'];
const SCHOOL_MONTHS = [3,4,5,6,7,8,9,10,11,12,1,2];

const pad2 = n => String(n).padStart(2, '0');
const dk   = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
function lastDay(y, m)  { return new Date(y, m, 0).getDate(); }
function dow(y, m, d)   { return new Date(y, m-1, d).getDay(); }
function isWeekend(y,m,d){ const w=dow(y,m,d); return w===0||w===6; }
function realYear(base, month) { return month <= 2 ? base + 1 : base; }
function monthWeekdays(y, m) {
  return Array.from({length: lastDay(y,m)}, (_,i)=>i+1).filter(d=>!isWeekend(y,m,d));
}

function calcSemester(sem) {
  const { sem1, sem2, summerStart, winterStart } = sem || {};
  const result = {};
  if (sem1 && sem2) {
    const [y2,m2,d2] = sem2.split('-').map(Number);
    const sem1End = new Date(y2,m2-1,d2-1);
    result.sem1 = { start: sem1, end: dk(sem1End.getFullYear(), sem1End.getMonth()+1, sem1End.getDate()) };
    const nextY = y2+1; const ld2 = lastDay(nextY,2);
    result.sem2 = { start: sem2, end: `${nextY}-02-${pad2(ld2)}` };
  }
  if (summerStart && sem2) {
    const [sy2,sm2,sd2] = sem2.split('-').map(Number);
    const summerEnd = new Date(sy2,sm2-1,sd2-1);
    const [ssy,ssm,ssd] = summerStart.split('-').map(Number);
    let cnt=0, cur=new Date(ssy,ssm-1,ssd);
    while(cur<=summerEnd){ if(cur.getDay()!==0&&cur.getDay()!==6) cnt++; cur=new Date(cur.getTime()+86400000); }
    result.summer = { start:summerStart, end:dk(summerEnd.getFullYear(),summerEnd.getMonth()+1,summerEnd.getDate()), days:cnt };
  }
  if (winterStart) {
    const [wsy,wsm,wsd] = winterStart.split('-').map(Number);
    const winEndYear = wsm>=3 ? wsy+1 : wsy;
    const winEndDay  = lastDay(winEndYear,2);
    const winEnd  = new Date(winEndYear,1,winEndDay);
    const winStart= new Date(wsy,wsm-1,wsd);
    if(winStart<=winEnd){
      let cnt=0,cur=new Date(winStart);
      while(cur<=winEnd){ if(cur.getDay()!==0&&cur.getDay()!==6) cnt++; cur=new Date(cur.getTime()+86400000); }
      result.winter = { start:winterStart, end:`${winEndYear}-02-${pad2(winEndDay)}`, days:cnt };
    }
  }
  return result;
}

function isVacationDay(dateStr, semInfo) {
  if(!semInfo) return false;
  if(semInfo.summer && dateStr>=semInfo.summer.start && dateStr<=semInfo.summer.end) return true;
  if(semInfo.winter && dateStr>=semInfo.winter.start && dateStr<=semInfo.winter.end) return true;
  return false;
}

function calcSchoolDays(y, m, events, semInfo) {
  return monthWeekdays(y,m).filter(d=>{ const k=dk(y,m,d); return !events[k]&&!isVacationDay(k,semInfo); }).length;
}

function eventLabel(val) {
  if(!val) return '';
  if(val===true) return '행';
  return String(val).charAt(0)||'행';
}

// ─────────────────────────────────────────────
// 학기 설정 모달
// ─────────────────────────────────────────────
function SemesterModal({ initial, onSave, onClose }) {
  const today = new Date();
  const [form, setForm] = useState({ sem1:initial.sem1||'', sem2:initial.sem2||'', summerStart:initial.summerStart||'', winterStart:initial.winterStart||'' });
  const [picking, setPicking] = useState('sem1');
  const [vy, setVY] = useState(today.getFullYear());
  const [vm, setVM] = useState(today.getMonth()+1);
  const TABS = [
    {key:'sem1',label:'1학기 시작일',color:'#3b82f6'},
    {key:'sem2',label:'2학기 시작일',color:'#f59e0b'},
    {key:'summerStart',label:'☀️ 여름방학 시작',color:'#ef4444'},
    {key:'winterStart',label:'❄️ 겨울방학 시작',color:'#06b6d4'},
  ];
  function pick(d) {
    const val = dk(vy,vm,d);
    setForm(prev=>({...prev,[picking]:val}));
    const idx = TABS.findIndex(t=>t.key===picking);
    if(idx<TABS.length-1) setPicking(TABS[idx+1].key);
  }
  const semInfo = calcSemester(form);
  const firstDow = new Date(vy,vm-1,1).getDay();
  const last = lastDay(vy,vm);
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1;d<=last;d++) cells.push(d);
  const pickColor = TABS.find(t=>t.key===picking)?.color||'#3b82f6';
  return (
    <div className="att-modal-overlay" onClick={onClose}>
      <div className="att-modal att-modal-wide" onClick={e=>e.stopPropagation()}>
        <div className="att-modal-header">
          <span>학기 · 방학 설정</span>
          <button className="att-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="att-sem-tabs" style={{gridTemplateColumns:'repeat(4,1fr)',display:'grid'}}>
          {TABS.map(({key,label,color})=>(
            <button key={key} className={`att-sem-tab ${picking===key?'active':''}`}
              style={picking===key?{borderBottomColor:color,color}:{}} onClick={()=>setPicking(key)}>
              <span style={{fontSize:'11px'}}>{label}</span>
              {form[key]&&<span className="att-sem-badge" style={picking===key?{background:color+'22',color}:{}}>{form[key]}</span>}
            </button>
          ))}
        </div>
        <div className="att-vac-preview" style={{flexWrap:'wrap',gap:'6px',display:'flex'}}>
          {semInfo.sem1   && <span className="att-vac-chip" style={{background:'#dbeafe',color:'#1d4ed8'}}>1학기 {semInfo.sem1.start}~{semInfo.sem1.end}</span>}
          {semInfo.sem2   && <span className="att-vac-chip" style={{background:'#fef3c7',color:'#92400e'}}>2학기 {semInfo.sem2.start}~{semInfo.sem2.end}</span>}
          {semInfo.summer && <span className="att-vac-chip" style={{background:'#fee2e2',color:'#991b1b'}}>☀️ 여름방학 {semInfo.summer.start}~{semInfo.summer.end} ({semInfo.summer.days}일)</span>}
          {semInfo.winter && <span className="att-vac-chip" style={{background:'#e0f2fe',color:'#0369a1'}}>❄️ 겨울방학 {semInfo.winter.start}~{semInfo.winter.end} ({semInfo.winter.days}일)</span>}
          {!semInfo.sem1  && <span className="att-vac-hint">위 탭에서 순서대로 날짜를 선택하세요.</span>}
        </div>
        <div className="att-cal-nav">
          <button onClick={()=>{if(vm===1){setVY(y=>y-1);setVM(12);}else setVM(m=>m-1)}}>◀</button>
          <span>{vy}년 {vm}월</span>
          <button onClick={()=>{if(vm===12){setVY(y=>y+1);setVM(1);}else setVM(m=>m+1)}}>▶</button>
        </div>
        <div className="att-cal-grid">
          {['일','월','화','수','목','금','토'].map(d=>(
            <div key={d} className={`att-cal-dow ${d==='일'?'sun':d==='토'?'sat':''}`}>{d}</div>
          ))}
          {cells.map((d,i)=>{
            if(!d) return <div key={`e${i}`}/>;
            const val=dk(vy,vm,d); const w=dow(vy,vm,d);
            const matchKey=TABS.find(t=>form[t.key]===val);
            return (
              <button key={d} onClick={()=>pick(d)}
                className={`att-cal-day ${w===0?'sun':w===6?'sat':''}`}
                style={matchKey?{background:matchKey.color,color:'#fff',fontWeight:700,borderRadius:'50%'}:{}}>{d}</button>
            );
          })}
        </div>
        <div className="att-modal-footer">
          <button className="att-btn-save" disabled={!form.sem1||!form.sem2} onClick={()=>onSave(form)}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 행사일 설정 모달
// ─────────────────────────────────────────────
function EventModal({ initialEvents, onSave, onClose }) {
  const today = new Date();
  const [events, setEvents] = useState({...initialEvents});
  const [vy, setVY] = useState(today.getFullYear());
  const [vm, setVM] = useState(today.getMonth()+1);
  const [editKey, setEditKey] = useState(null);
  const [editName, setEditName] = useState('');
  function handleDayClick(key) {
    if(events[key]){ setEvents(prev=>{const n={...prev};delete n[key];return n;}); if(editKey===key) setEditKey(null); }
    else { setEditKey(key); setEditName(''); }
  }
  function confirmName() {
    if(!editKey) return;
    setEvents(prev=>({...prev,[editKey]:editName.trim()||'행사'}));
    setEditKey(null); setEditName('');
  }
  const firstDow=new Date(vy,vm-1,1).getDay(); const last=lastDay(vy,vm);
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1;d<=last;d++) cells.push(d);
  return (
    <div className="att-modal-overlay" onClick={onClose}>
      <div className="att-modal att-modal-wide" onClick={e=>e.stopPropagation()}>
        <div className="att-modal-header">
          <span>📅 행사일 설정</span>
          <button className="att-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="att-vac-preview">
          <span className="att-vac-hint">클릭하면 행사일 추가(이름 입력), 다시 클릭하면 삭제 · 등록: {Object.keys(events).length}일</span>
        </div>
        {editKey&&(
          <div className="att-event-input-bar">
            <span className="att-event-input-label">{editKey} 행사명:</span>
            <input className="att-event-input" placeholder="예: 운동회, 현장체험" value={editName} autoFocus
              onChange={e=>setEditName(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') confirmName(); if(e.key==='Escape') setEditKey(null); }}/>
            <button className="att-btn-save" style={{padding:'5px 12px',fontSize:'12px'}} onClick={confirmName}>확인</button>
          </div>
        )}
        <div className="att-cal-nav">
          <button onClick={()=>{if(vm===1){setVY(y=>y-1);setVM(12);}else setVM(m=>m-1)}}>◀</button>
          <span>{vy}년 {vm}월</span>
          <button onClick={()=>{if(vm===12){setVY(y=>y+1);setVM(1);}else setVM(m=>m+1)}}>▶</button>
        </div>
        <div className="att-cal-grid">
          {['일','월','화','수','목','금','토'].map(d=>(
            <div key={d} className={`att-cal-dow ${d==='일'?'sun':d==='토'?'sat':''}`}>{d}</div>
          ))}
          {cells.map((d,i)=>{
            if(!d) return <div key={`e${i}`}/>;
            const key=dk(vy,vm,d); const w=dow(vy,vm,d);
            const evtName=events[key]; const isEdit=editKey===key;
            return (
              <button key={d} className={`att-cal-day ${w===0?'sun':w===6?'sat':''} ${evtName?'event-day':''} ${isEdit?'editing-day':''}`}
                onClick={()=>handleDayClick(key)} title={evtName||''}>
                {evtName?<span style={{fontSize:'10px',fontWeight:800}}>{evtName.charAt(0)}</span>:d}
              </button>
            );
          })}
        </div>
        {Object.keys(events).length>0&&(
          <div className="att-event-list">
            {Object.entries(events).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>(
              <div key={k} className="att-event-list-item">
                <span className="att-event-list-date">{k}</span>
                <span className="att-event-list-name">{v}</span>
                <button className="att-event-list-del" onClick={()=>setEvents(prev=>{const n={...prev};delete n[k];return n;})}>×</button>
              </div>
            ))}
          </div>
        )}
        <div className="att-modal-footer">
          <div/>
          <button className="att-btn-save" onClick={()=>onSave(events)}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 사이드바 위젯 (Dashboard에서 사용)
// ─────────────────────────────────────────────
export function AttendanceSidebar({ students, records: recordsProp, selectedMonth, selectedDay }) {
  const records = recordsProp || {};
  const today   = new Date();
  const baseYear = currentSchoolYear();
  const viewMonth = selectedMonth || today.getMonth()+1;
  const viewYear  = realYear(baseYear, viewMonth);
  const viewDay   = selectedDay || today.getDate();
  const viewDK    = selectedDay ? dk(viewYear,viewMonth,viewDay) : dk(today.getFullYear(),today.getMonth()+1,today.getDate());
  const active = (students||[]).filter(s=>s.is_active!==false);
  const total  = active.length;
  let absent=0,early=0;
  active.forEach(s=>{
    const t=records[s.id]?.[viewDK];
    if(t==='sick'||t==='field'||t==='approved'||t==='other') absent++;
    if(t==='early') early++;
  });
  const present = total-absent-early;
  const wdays   = monthWeekdays(viewYear,viewMonth);
  const monthly = {field:0,approved:0,sick:0,early:0,other:0};
  active.forEach(s=>wdays.forEach(dd=>{
    const t=records[s.id]?.[dk(viewYear,viewMonth,dd)];
    if(t&&monthly[t]!==undefined) monthly[t]++;
  }));
  return (
    <div className="att-sidebar-widget">
      <div className="att-sw-date">{selectedDay?`${viewMonth}월 ${viewDay}일`:`오늘 (${today.getMonth()+1}/${today.getDate()})`} 출결</div>
      <div className="att-sw-grid">
        {[['재적',total,''],['결석',absent,'red'],['조퇴',early,'orange'],['현원',present,'blue']].map(([l,v,c])=>(
          <div key={l} className="att-sw-item">
            <span className="att-sw-label">{l}</span>
            <span className={`att-sw-val ${c}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="att-sw-divider"/>
      <div className="att-sw-monthly-title">{viewMonth}월 누계</div>
      <div className="att-sw-monthly">
        {[['field','체험학습','#3b82f6'],['approved','출석인정','#8b5cf6'],['sick','병결','#ef4444'],['early','조퇴','#f59e0b'],['other','기타','#6b7280']].map(([k,l,c])=>(
          <div key={k} className="att-sw-monthly-item">
            <span className="att-sw-dot" style={{background:c}}/>
            <span className="att-sw-monthly-label">{l}</span>
            <span className="att-sw-monthly-val">{monthly[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function Attendance() {
  const baseYear = currentSchoolYear();
  const today    = new Date();

  const [students,    setStudents]    = useState([]);
  const [records,     setRecords]     = useState({});
  const [notes,       setNotes]       = useState({});
  const [events,      setEvents]      = useState({});
  const [semester,    setSemester]    = useState({});
  const [month,       setMonth]       = useState(today.getMonth()+1);
  const [showSem,     setShowSem]     = useState(false);
  const [showEvt,     setShowEvt]     = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [statusFilter,setStatusFilter]= useState('field');
  const [checkedRows, setCheckedRows] = useState({});
  const [loading,     setLoading]     = useState(true);
  const [conflictInfo,setConflictInfo]= useState(null);
  const [tooltip,     setTooltip]     = useState(null); // {text, x, y}

  const year = realYear(baseYear, month);

  // ── 초기 데이터 로드 ──
  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [studentsData, recordsData, notesData, eventsData, semesterData] = await Promise.all([
        studentsAPI.getAll(),
        attendanceAPI.getRecords(),
        attendanceAPI.getNotes(),
        attendanceAPI.getEvents(),
        attendanceAPI.getSemester(),
      ]);
      setStudents(Array.isArray(studentsData) ? studentsData.filter(s=>s.is_active!==false) : []);
      setRecords(recordsData || {});
      setNotes(notesData || {});
      setEvents(eventsData || {});
      setSemester(semesterData || {});
    } catch(e) {
      console.error('출결 데이터 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  const semInfo  = calcSemester(semester);
  const weekdays = monthWeekdays(year, month);

  function isDisabledDay(d) {
    const key = dk(year,month,d);
    return !!events[key] || isVacationDay(key, semInfo);
  }

  const schoolDays = weekdays.filter(d=>!isDisabledDay(d)).length;

  // ── 출결 클릭 순환 ──
  const cycleType = async (sid, key) => {
    const dayNum = parseInt(key.slice(8));
    setSelectedDay(dayNum);
    localStorage.setItem('att_ui_state', JSON.stringify({month, day:dayNum}));

    const cur  = records[sid]?.[key] ?? null;
    const next = TYPE_ORDER[(TYPE_ORDER.indexOf(cur)+1) % TYPE_ORDER.length];

    // UI 즉시 반영
    setRecords(prev => {
      const updated = {...prev, [sid]: {...prev[sid], [key]: next}};
      if (next === null) delete updated[sid][key];
      // Dashboard 사이드바 실시간 반영
      localStorage.setItem('att_records', JSON.stringify(updated));
      return updated;
    });

    // DB 저장
    try {
      await attendanceAPI.saveRecord(sid, key, next);
      // DB에서 다시 읽어서 최신 상태 반영
      const fresh = await attendanceAPI.getRecords();
      setRecords(fresh || {});
      localStorage.setItem('att_records', JSON.stringify(fresh || {}));
    } catch(e) {
      console.error('출결 저장 실패:', e);
    }
  };

  // ── 사유 변경 ──
  const changeNote = async (sid, key, val) => {
    const noteKey = `${sid}_${key}`;
    setNotes(prev => ({...prev, [noteKey]: val}));
    try {
      await attendanceAPI.saveNote(sid, key, val);
    } catch(e) {
      console.error('사유 저장 실패:', e);
    }
  };

  // ── 학기 저장 ──
  const saveSemester = async (form) => {
    setSemester(form);
    setShowSem(false);
    try {
      await attendanceAPI.saveSemester(form);
    } catch(e) {
      console.error('학기 저장 실패:', e);
    }
  };

  // ── 행사일 저장 ──
  const saveEvents = async (evts) => {
    setEvents(evts);
    setShowEvt(false);
    try {
      await attendanceAPI.saveEvents(evts);
    } catch(e) {
      console.error('행사일 저장 실패:', e);
    }
  };

  // ── 이번 달 집계 ──
  const monthlyCounts = {field:0, approved:0, sick:0, early:0, other:0};
  students.forEach(s=>weekdays.forEach(d=>{
    const t=records[s.id]?.[dk(year,month,d)];
    if(t && monthlyCounts[t]!==undefined) monthlyCounts[t]++;
  }));

  // ── 현황 목록 ──
  const statusList = students.flatMap(s=>
    weekdays.filter(d=>records[s.id]?.[dk(year,month,d)]===statusFilter)
      .map(d=>({student:s, day:d, dkey:dk(year,month,d)}))
  );

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'400px',flexDirection:'column',gap:'16px'}}>
      <div className="spinner"/><p>출결 데이터 불러오는 중...</p>
    </div>
  );

  return (
    <div className="att-page">
      {/* ── 상단 바 ── */}
      <div className="att-top-bar">
        <div className="att-top-center">
          <button className="att-event-btn" onClick={()=>setShowEvt(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/>
            </svg>
            행사일 설정
          </button>
          {Object.keys(events).length>0&&(
            <span className="att-sem-chip" style={{background:'#fef3c7',color:'#92400e'}}>행사일 {Object.keys(events).length}일 등록됨</span>
          )}
        </div>
        <div className="att-top-right">
          {semInfo.sem1  &&<span className="att-sem-chip sem1">1학기 {semInfo.sem1.start}~{semInfo.sem1.end}</span>}
          {semInfo.sem2  &&<span className="att-sem-chip sem2">2학기 {semInfo.sem2.start}~{semInfo.sem2.end}</span>}
          {semInfo.summer&&<span className="att-sem-chip summer">☀️ {semInfo.summer.days}일</span>}
          {semInfo.winter&&<span className="att-sem-chip winter">❄️ {semInfo.winter.days}일</span>}
          <button className="att-semester-btn" onClick={()=>setShowSem(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="12" y2="19"/>
            </svg>
            학기 설정
          </button>
        </div>
      </div>

      {/* ── 월 선택 ── */}
      <div className="att-month-bar">
        {SCHOOL_MONTHS.map(m=>{
          const y2=realYear(baseYear,m);
          const sd=calcSchoolDays(y2,m,events,semInfo);
          return (
            <button key={m} className={`att-month-btn ${month===m?'active':''}`}
              onClick={()=>{setMonth(m);setSelectedDay(null);localStorage.setItem('att_ui_state',JSON.stringify({month:m,day:null}));}}>
              <span>{m}월</span>
              <span className="att-month-school-days">({sd}일)</span>
            </button>
          );
        })}
        <div className="att-year-badge">{baseYear}년도</div>
      </div>

      {/* ── 스프레드시트 ── */}
      <div className="att-sheet-wrap">
        <div className="att-sheet-scroll">
          <table className="att-sheet">
            <thead>
              <tr>
                <th className="att-th-name">이름</th>
                {weekdays.map(d=>{
                  const w=dow(year,month,d); const dkey=dk(year,month,d);
                  const evtVal=events[dkey]; const isVac=isVacationDay(dkey,semInfo);
                  const dis=!!evtVal||isVac;
                  return (
                    <th key={d} className={`att-th-day ${w===5?'fri':''} ${dis?'disabled-col':''} ${selectedDay===d?'selected-col':''}`}
                      onClick={()=>{ const newDay=selectedDay===d?null:d; setSelectedDay(newDay); localStorage.setItem('att_ui_state',JSON.stringify({month,day:newDay})); }}
                      style={{cursor:'pointer'}} title={evtVal?(typeof evtVal==='string'?evtVal:'행사일'):`${month}/${d}`}>
                      {isVac
                        ? <span className="att-col-disabled-label">{semInfo.summer&&dkey>=semInfo.summer.start&&dkey<=semInfo.summer.end?'여':'겨'}</span>
                        : evtVal
                          ? <><div className="att-th-day-num" style={{color:'#ef4444',fontWeight:800}}>{eventLabel(evtVal)}</div><div className="att-th-day-dow">{d}</div></>
                          : <><div className="att-th-day-num">{d}</div><div className="att-th-day-dow">{DOW_SHORT[w]}</div></>
                      }
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {students.map(s=>(
                <tr key={s.id}>
                  <td className="att-td-name">
                    <span className="att-num">{s.student_number}</span>
                    <span className="att-name">{s.name}</span>
                  </td>
                  {weekdays.map(d=>{
                    const dkey=dk(year,month,d); const evtVal=events[dkey];
                    const isVac=isVacationDay(dkey,semInfo); const dis=!!evtVal||isVac;
                    const type=records[s.id]?.[dkey]??null;
                    const tInfo=ABSENCE_TYPES.find(t=>t.key===type);
                    return (
                      <td key={d} className={`att-td-cell ${dis?'cell-disabled':''}`}
                        onClick={()=>{ if(!dis) cycleType(s.id,dkey); }}
                        onMouseEnter={e=>{ if(!dis) setTooltip({text:`${s.student_number} ${s.name}`, x:e.clientX, y:e.clientY}); }}
                        onMouseMove={e=>{ if(!dis&&tooltip) setTooltip(t=>t?{...t,x:e.clientX,y:e.clientY}:null); }}
                        onMouseLeave={()=>setTooltip(null)}
                        style={!dis&&type?{background:tInfo.color+'33'}:{}}>
                        {dis
                          ? <span className="att-cell-dis-txt">
                              {isVac?(semInfo.summer&&dkey>=semInfo.summer.start&&dkey<=semInfo.summer.end?'여':'겨')
                                :<span style={{color:'#ef4444',fontWeight:800}}>{eventLabel(evtVal)}</span>}
                            </span>
                          : type ? <span className="att-cell-badge" style={{background:tInfo.color}}>{tInfo.short}</span> : null
                        }
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 범례 ── */}
        <div className="att-legend">
          {ABSENCE_TYPES.filter(t=>t.key).map(t=>(
            <span key={t.key} className="att-legend-item">
              <span className="att-legend-badge" style={{background:t.color}}>{t.short}</span>{t.label}
            </span>
          ))}
          <span className="att-legend-item">
            <span className="att-legend-badge" style={{background:'#94a3b8',fontSize:'9px'}}>여/겨</span>방학
          </span>
          <span className="att-school-days-badge">이번 달 수업일수: {schoolDays}일</span>
          <span className="att-legend-tip">※ 클릭: 체험→출석인정→병결→조퇴→기타→출석</span>
        </div>
      </div>

      {/* ── 출결 현황 ── */}
      <div className="att-status-section">
        <div className="att-status-header">
          <span className="att-status-title">출결 현황</span>
          <div className="att-status-filter">
            {[['field','체험학습','#3b82f6'],['approved','출석인정','#8b5cf6'],['sick','병결','#ef4444'],['early','조퇴','#f59e0b'],['other','기타','#6b7280']].map(([k,l,c])=>(
              <button key={k} className={`att-filter-btn ${statusFilter===k?'active':''}`}
                style={statusFilter===k?{background:c,borderColor:c,color:'#fff'}:{borderColor:c,color:c}}
                onClick={()=>{setStatusFilter(k);setCheckedRows({});}}>
                {l} <span className="att-filter-count">{monthlyCounts[k]}</span>
              </button>
            ))}
          </div>
        </div>
        {statusList.length===0
          ? <div className="att-status-empty">이번 달 {ABSENCE_TYPES.find(t=>t.key===statusFilter)?.label} 기록이 없습니다.</div>
          : <div className="att-status-list">
              {statusList.map(({student:s,day:d,dkey},i)=>{
                const tInfo=ABSENCE_TYPES.find(t=>t.key===statusFilter);
                const noteVal=notes[`${s.id}_${dkey}`]||'';
                const chkKey=`${s.id}_${dkey}`;
                return (
                  <div key={i} className={`att-status-row ${checkedRows[chkKey]?'checked':''}`}>
                    <button className={`att-check-box ${checkedRows[chkKey]?'on':''}`}
                      onClick={()=>setCheckedRows(p=>({...p,[chkKey]:!p[chkKey]}))}>
                      {checkedRows[chkKey]?'☑':'☐'}
                    </button>
                    <span className="att-sr-type" style={{background:tInfo.color}}>{tInfo.label}</span>
                    <span className="att-sr-date">{month}/{d}</span>
                    <span className="att-sr-num">{s.student_number}번</span>
                    <span className="att-sr-name">{s.name}</span>
                    {/* 모든 유형에 사유 입력 가능 */}
                    <input className="att-sr-note"
                      placeholder={`${tInfo.label} 사유...`}
                      value={noteVal}
                      onChange={e=>changeNote(s.id,dkey,e.target.value)}/>
                  </div>
                );
              })}
            </div>
        }
      </div>

      {showSem&&<SemesterModal initial={semester} onSave={saveSemester} onClose={()=>setShowSem(false)}/>}
      {showEvt&&<EventModal initialEvents={events} onSave={saveEvents} onClose={()=>setShowEvt(false)}/>}

      {conflictInfo&&(
        <div className="att-modal-overlay" onClick={()=>setConflictInfo(null)}>
          <div className="att-modal" style={{width:360}} onClick={e=>e.stopPropagation()}>
            <div className="att-modal-header" style={{borderBottom:'2px solid #f59e0b'}}>
              <span style={{color:'#92400e'}}>⚠️ 출결 기록 충돌</span>
              <button className="att-modal-close" onClick={()=>setConflictInfo(null)}>×</button>
            </div>
            <div style={{padding:'16px'}}>
              <p style={{fontSize:'13.5px',color:'#334155',lineHeight:1.6,marginBottom:'16px'}}>{conflictInfo.message}</p>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                <button style={{padding:'9px',borderRadius:'8px',border:'none',background:'#ef4444',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}
                  onClick={conflictInfo.onConfirm}>출결 기록 삭제하고 설정</button>
                <button style={{padding:'9px',borderRadius:'8px',border:'1px solid #e2e8f0',background:'#f8fafc',color:'#334155',fontWeight:600,cursor:'pointer',fontSize:'13px',fontFamily:'inherit'}}
                  onClick={conflictInfo.onCancel}>{conflictInfo.cancelLabel}</button>
                <button style={{padding:'9px',borderRadius:'8px',border:'1px solid #e2e8f0',background:'transparent',color:'#94a3b8',cursor:'pointer',fontSize:'12.5px',fontFamily:'inherit'}}
                  onClick={()=>setConflictInfo(null)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tooltip&&(
        <div className="att-tooltip-fixed" style={{left:tooltip.x+12,top:tooltip.y-30,color:'#ffffff',background:'rgba(15,23,42,.92)'}}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}