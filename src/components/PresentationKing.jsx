import React, { useState, useEffect, useCallback, useRef } from 'react';
import { seatingAPI, studentsAPI } from '../utils/api';
import { presentationAPI } from '../utils/api';
import './PresentationKing.css';

const BOOK_COLORS = [['#FF6B6B','#C0392B'],['#4ECDC4','#1A8A83'],['#FFD93D','#D4A900'],['#6BCB77','#2E8B3E'],['#A78BFA','#7C3AED']];

function BookStack({ count }) {
  const books = [];
  for (let i = 0; i < Math.min(count, 5); i++) {
    const [light, dark] = BOOK_COLORS[i % BOOK_COLORS.length];
    const tilt = (i % 2 === 0 ? 1 : -1) * (i * 0.8);
    const yOffset = (4 - i) * 7;
    books.push(<g key={i} transform={`translate(0, ${yOffset}) rotate(${tilt}, 20, 10)`}><rect x="2" y="0" width="36" height="13" rx="1.5" fill={light} stroke={dark} strokeWidth="1.2"/><rect x="2" y="0" width="5" height="13" rx="1.5" fill={dark}/><rect x="7" y="1" width="30" height="11" rx="0.5" fill={light} opacity="0.85"/></g>);
  }
  return <svg width="44" height="54" viewBox="0 0 44 54" style={{overflow:'visible'}}><g transform="translate(2, 5)">{books}</g></svg>;
}

function GoldBook() {
  return (<svg width="16" height="54" viewBox="0 0 16 54" style={{overflow:'visible'}}><defs><linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFD700"/><stop offset="50%" stopColor="#FDB931"/><stop offset="100%" stopColor="#D4AF37"/></linearGradient></defs><rect x="0" y="0" width="14" height="50" rx="1.5" fill="url(#goldGrad)" stroke="#B8860B" strokeWidth="1.2"/><rect x="0" y="0" width="3" height="50" rx="1" fill="#B8860B"/></svg>);
}

function PresentationVisual({ count, isSpecial }) {
  if (count === 0) return <div className="no-presentation">📭</div>;
  const fullStacks = Math.floor(count / 5);
  const remainder = count % 5;
  return (
    <div className="book-visual">
      {Array.from({length:fullStacks}).map((_,i) => <div key={`gold-${i}`} className="gold-book-wrap"><GoldBook/></div>)}
      {remainder > 0 && <div className="book-stack-wrap"><BookStack count={remainder}/></div>}
      {isSpecial && <svg width="18" height="18" viewBox="0 0 24 24" className="star-badge"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#FFD700" stroke="#F59E0B" strokeWidth="1"/></svg>}
    </div>
  );
}

export default function PresentationKing() {
  const [arrangements, setArrangements] = useState([]);
  const [selectedArrangement, setSelectedArrangement] = useState(null);
  const [grid, setGrid] = useState(Array(10).fill(null).map(() => Array(10).fill(null)));
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [presentData, setPresentData] = useState({});
  const [weeklyData, setWeeklyData] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminView, setAdminView] = useState('daily');
  const [adminDate, setAdminDate] = useState(new Date().toISOString().split('T')[0]);
  const [adminData, setAdminData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const rightClickGuard = useRef(false);
  const LAST_ARR_KEY = 'pk_last_arrangement_id';

  const showToast = useCallback((msg, type='info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({msg,type});
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => { loadInitial(); }, []);

  const loadInitial = async () => {
    try {
      const [arr, stu] = await Promise.all([seatingAPI.getArrangements(), studentsAPI.getAll()]);
      setArrangements(arr);
      setStudents(stu);
      const lastId = parseInt(localStorage.getItem(LAST_ARR_KEY));
      if (lastId && arr.find(a => a.id === lastId)) await loadArrangementGrid(lastId);
      else if (arr.length === 1) await loadArrangementGrid(arr[0].id);
    } catch (e) { console.error('로드 실패:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedArrangement && students.length > 0) { loadDailyData(selectedDate); loadWeeklyData(); }
  }, [selectedDate, selectedArrangement, students]);

  const loadArrangementGrid = async (id) => {
    try {
      const data = await seatingAPI.getArrangementDetails(id);
      const g = Array(10).fill(null).map(() => Array(10).fill(null));
      data.positions.forEach(p => { g[p.row_pos][p.col_pos] = { id: p.student_id, name: p.name, student_number: p.student_number }; });
      setGrid(g);
      setSelectedArrangement(data.arrangement);
      localStorage.setItem(LAST_ARR_KEY, String(id));
    } catch (e) { console.error('그리드 로드 실패:', e); }
  };

  const loadDailyData = async (date) => {
    try {
      const result = await presentationAPI.getDaily(date);
      const map = {};
      result.forEach(r => { map[r.student_id] = { today: r.count || 0, special: r.special || 0 }; });
      setPresentData(map);
    } catch (e) {
      const stored = localStorage.getItem(`pres_${date}`);
      setPresentData(stored ? JSON.parse(stored) : {});
    }
  };

  const loadWeeklyData = async () => {
    try { setWeeklyData(await presentationAPI.getWeekly()); } catch (e) { setWeeklyData([]); }
  };

  const saveDailyData = async (date) => {
    const arrId = selectedArrangement?.id || null;
    try {
      const entries = Object.entries(presentData).map(([id, d]) => ({
        student_id: parseInt(id), count: d.today || 0, special: d.special || 0, date, arrangement_id: arrId
      }));
      if (entries.length > 0) await presentationAPI.saveDaily(entries);
      localStorage.setItem(`pres_${date}`, JSON.stringify(presentData));
    } catch (e) { localStorage.setItem(`pres_${date}`, JSON.stringify(presentData)); }
  };

  const handleLeftClick = useCallback((student, e) => {
    if (!student || student.type === 'furniture') return;
    if (rightClickGuard.current) { rightClickGuard.current = false; return; }
    const prev = presentData[student.id] || { today: 0, special: 0 };
    setUndoStack(s => [...s.slice(-19), { studentId: student.id, name: student.name, prevCount: prev.today, prevSpecial: prev.special, type: 'increment' }]);
    setPresentData(p => { const c = p[student.id] || {today:0,special:0}; const u = {...p,[student.id]:{...c,today:c.today+1}}; localStorage.setItem(`pres_${selectedDate}`,JSON.stringify(u)); return u; });
    showToast(`${student.name} 발표! 📚`, 'book');
    const arrId = selectedArrangement?.id;
    (async () => { try { await presentationAPI.increment(student.id, selectedDate, arrId); await loadWeeklyData(); } catch(e){} })();
  }, [presentData, selectedDate, showToast, selectedArrangement]);

  const handleRightClick = useCallback((student, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!student || student.type === 'furniture') return;
    rightClickGuard.current = true;
    setTimeout(() => { rightClickGuard.current = false; }, 300);
    const prev = presentData[student.id] || { today: 0, special: 0 };
    const newSpecial = prev.special > 0 ? 0 : 1;
    setUndoStack(s => [...s.slice(-19), { studentId: student.id, name: student.name, prevCount: prev.today, prevSpecial: prev.special, type: 'special' }]);
    setPresentData(p => { const c = p[student.id] || {today:0,special:0}; const u = {...p,[student.id]:{...c,special:newSpecial}}; localStorage.setItem(`pres_${selectedDate}`,JSON.stringify(u)); return u; });
    showToast(`${student.name} - ${newSpecial > 0 ? '⭐ 우수발표!' : '우수발표 취소'}`, 'star');
    const arrId = selectedArrangement?.id;
    (async () => { try { await presentationAPI.toggleSpecial(student.id, selectedDate, arrId); } catch(e){} })();
  }, [presentData, selectedDate, showToast, selectedArrangement]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    if (last.type === 'special') {
      setPresentData(p => { const c = p[last.studentId]||{today:0,special:0}; const u = {...p,[last.studentId]:{...c,special:last.prevSpecial}}; localStorage.setItem(`pres_${selectedDate}`,JSON.stringify(u)); return u; });
      showToast(`${last.name} 우수발표 되돌림`, 'undo');
      (async()=>{try{await presentationAPI.toggleSpecial(last.studentId,selectedDate);}catch(e){}})();
    } else {
      setPresentData(p => { const c = p[last.studentId]||{today:0,special:0}; const u = {...p,[last.studentId]:{...c,today:last.prevCount}}; localStorage.setItem(`pres_${selectedDate}`,JSON.stringify(u)); return u; });
      showToast(`${last.name} 발표 취소됨`, 'undo');
      (async()=>{try{await presentationAPI.decrement(last.studentId,selectedDate);await loadWeeklyData();}catch(e){}})();
    }
    setUndoStack(s => s.slice(0, -1));
  }, [undoStack, selectedDate, showToast]);

  const handleSave = async () => { await saveDailyData(selectedDate); await loadWeeklyData(); showToast('저장 완료! ✓', 'success'); };
  const handleDateChange = (d) => { setSelectedDate(d); setShowDatePicker(false); setUndoStack([]); };

  const loadAdminData = async () => { try { setAdminData(await presentationAPI.getDaily(adminDate)); } catch(e) { showToast('로드 실패','error'); setAdminData([]); } };
  const loadStats = async () => { try { setStatsData(await presentationAPI.getStats()); } catch(e) { showToast('통계 로드 실패','error'); } };

  useEffect(() => { if (showAdmin) { if (adminView === 'daily') loadAdminData(); else loadStats(); } }, [showAdmin, adminView, adminDate]);

  const handleAdminUpdate = async (sid, field, val) => { try { await presentationAPI.updateDaily(sid, adminDate, {[field]:parseInt(val)||0}); await loadAdminData(); showToast('수정됨 ✓','success'); } catch(e) { showToast('수정 실패','error'); } };
  const handleAdminDelete = async (sid) => { if(!confirm('이 날 기록을 삭제하시겠습니까?')) return; try { await presentationAPI.deleteDaily(sid,adminDate); await loadAdminData(); showToast('삭제됨','success'); } catch(e) { showToast('삭제 실패','error'); } };

  const weeklyRanking = [...weeklyData].map(w => ({...w, count:parseInt(w.count)||0, special:parseInt(w.special)||0})).sort((a,b) => b.count-a.count || b.special-a.special);
  const todayTotal = Object.values(presentData).reduce((s,d) => s + (d.today||0), 0);
  const todayStudentCount = Object.values(presentData).filter(d => (d.today||0) > 0).length;

  if (loading) return <div className="pk-loading"><div className="pk-loading-books">📚📖📕</div><p>발표왕 로딩 중...</p></div>;

  if (!selectedArrangement) return (
    <div className="pk-root"><div className="pk-select-screen"><div className="pk-select-card">
      <div className="pk-select-icon">🪑</div>
      <h2>자리배치를 선택하세요</h2>
      <p>발표 기록을 표시할 자리배치를 선택해주세요.<br/>다음부터는 자동으로 불러옵니다.</p>
      <div className="pk-arrangement-list">
        {arrangements.length === 0 ? <p className="pk-empty">자리배치가 없습니다.</p> : arrangements.map(arr => (
          <button key={arr.id} className="pk-arrangement-btn" onClick={() => loadArrangementGrid(arr.id)}>
            <span className="pk-arr-icon">🏫</span><span className="pk-arr-title">{arr.title}</span>
            <span className="pk-arr-date">{new Date(arr.created_at).toLocaleDateString('ko-KR')}</span>
          </button>
        ))}
      </div>
    </div></div></div>
  );

  return (
    <div className="pk-root">
      <div className="pk-header">
        <div className="pk-header-left">
          <h1 className="pk-title"><span className="pk-crown">👑</span> 발표왕</h1>
          <button className="pk-date-btn" onClick={() => setShowDatePicker(!showDatePicker)}>📅 {selectedDate}</button>
          {showDatePicker && <div className="pk-date-picker"><input type="date" value={selectedDate} onChange={e => handleDateChange(e.target.value)} className="pk-date-input" autoFocus/></div>}
          <span className="pk-today-count">오늘 {todayTotal}회 ({todayStudentCount}명)</span>
        </div>
        <div className="pk-header-right">
          {undoStack.length > 0 && <button className="pk-btn pk-btn-undo" onClick={handleUndo}>↩ 되돌리기 ({undoStack.length})</button>}
          <button className="pk-btn pk-btn-save" onClick={handleSave}>💾 저장</button>
          <button className="pk-btn pk-btn-admin" onClick={() => setShowAdmin(true)}>⚙️ 관리</button>
        </div>
      </div>

      <div className="pk-arrangement-bar">
        <span className="pk-arr-current">🪑 {selectedArrangement.title}</span>
        <button className="pk-btn pk-btn-change" onClick={() => { setSelectedArrangement(null); setGrid(Array(10).fill(null).map(()=>Array(10).fill(null))); localStorage.removeItem(LAST_ARR_KEY); }}>배치 변경</button>
        <div className="pk-hints">
          <span>🖱️ 클릭 → 발표 +1</span>
          <span>🖱️ 우클릭 → ⭐ 우수발표</span>
          <span>↩ 되돌리기 → 실행 취소</span>
        </div>
      </div>

      <div className="pk-content">
        <div className="pk-grid-area">
          <div className="pk-label pk-label-top">📺 칠판</div>
          <div className="pk-grid-wrap">
            <div className="pk-label pk-label-side">복도</div>
            <div className="pk-grid">
              {grid.map((row,i) => row.map((cell,j) => {
                const isFurn = cell?.type === 'furniture';
                const sd = cell && !isFurn ? (presentData[cell.id]||{today:0,special:0}) : null;
                const cnt = sd?.today||0;
                const isSp = (sd?.special||0) > 0;
                return (
                  <div key={`${i}-${j}`}
                    className={`pk-cell ${!cell?'pk-cell-empty':''} ${isFurn?'pk-cell-furniture':''} ${cell&&!isFurn?'pk-cell-student':''} ${isSp?'pk-cell-special':''} ${cnt>0?'pk-cell-has-count':''}`}
                    onClick={e => cell && !isFurn && handleLeftClick(cell, e)}
                    onContextMenu={e => cell && !isFurn && handleRightClick(cell, e)}
                  >
                    {cell && !isFurn && (<>
                      <div className="pk-student-name">{isSp && <span className="pk-star-inline">⭐</span>}{cell.name}</div>
                      <div className="pk-book-wrap"><PresentationVisual count={cnt} isSpecial={isSp}/></div>
                      {cnt > 0 && <div className={`pk-count-badge ${isSp?'pk-count-badge-special':''}`}>{cnt}</div>}
                    </>)}
                    {isFurn && <div className="pk-furniture-cell">🪑</div>}
                  </div>
                );
              }))}
            </div>
            <div className="pk-label pk-label-side">창문</div>
          </div>
          <div className="pk-label pk-label-bottom">📌 게시판 (뒤)</div>
        </div>

        <div className="pk-sidebar">
          <div className="pk-sidebar-header">
            <span className="pk-sidebar-title">📊 이번 주 발표</span>
            <span className="pk-sidebar-total">총 {weeklyRanking.reduce((s,r)=>s+r.count,0)}회</span>
          </div>
          <div className="pk-ranking-list">
            {weeklyRanking.length === 0 ? (
              <div className="pk-ranking-empty"><p>아직 기록 없음</p><p className="pk-ranking-hint">학생을 클릭해서 시작하세요!</p></div>
            ) : weeklyRanking.map((s,idx) => {
              const tc = presentData[s.student_id]?.today||0;
              const ts = presentData[s.student_id]?.special||0;
              const mx = Math.max(...weeklyRanking.map(r=>r.count),1);
              return (
                <div key={s.student_id} className={`pk-rank-item ${idx===0?'pk-rank-first':idx===1?'pk-rank-second':idx===2?'pk-rank-third':''}`}>
                  <div className="pk-rank-medal">{idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':<span className="pk-rank-num">{idx+1}</span>}</div>
                  <div className="pk-rank-info">
                    <span className="pk-rank-name">{(s.special>0||ts>0)&&'⭐ '}{s.name}</span>
                    <div className="pk-rank-bar-wrap"><div className="pk-rank-bar" style={{width:`${Math.min(100,(s.count/mx)*100)}%`}}/></div>
                  </div>
                  <div className="pk-rank-count">
                    <span className="pk-rank-total">{s.count}</span>
                    {tc > 0 && <span className="pk-rank-today">+{tc}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pk-no-present-section">
            <div className="pk-no-present-title">📭 오늘 미발표</div>
            <div className="pk-no-present-list">
              {students.filter(s => !presentData[s.id] || presentData[s.id].today === 0).map(s => <span key={s.id} className="pk-no-present-tag">{s.name}</span>)}
              {students.filter(s => !presentData[s.id] || presentData[s.id].today === 0).length === 0 && <span className="pk-all-done">🎉 모두 발표!</span>}
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`pk-toast pk-toast-${toast.type}`}>{toast.msg}</div>}

      {showAdmin && (
        <div className="pk-modal-overlay" onClick={() => setShowAdmin(false)}>
          <div className="pk-modal pk-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="pk-modal-header">
              <h2>⚙️ 발표 관리</h2>
              <button className="pk-modal-close" onClick={() => setShowAdmin(false)}>×</button>
            </div>
            <div className="pk-admin-tabs">
              {[{key:'daily',label:'📅 일별 데이터'},{key:'stats',label:'📊 통계'}].map(t => (
                <button key={t.key} className={`pk-admin-tab ${adminView===t.key?'active':''}`} onClick={() => setAdminView(t.key)}>{t.label}</button>
              ))}
            </div>
            <div className="pk-admin-body">
              {adminView === 'daily' && (
                <div className="pk-admin-daily">
                  <div className="pk-admin-date-row">
                    <label>날짜</label>
                    <input type="date" className="pk-admin-date-input" value={adminDate} onChange={e => setAdminDate(e.target.value)}/>
                    <button className="pk-btn pk-btn-small" onClick={loadAdminData}>조회</button>
                  </div>
                  <div className="pk-admin-table-wrap">
                    <table className="pk-admin-table">
                      <thead><tr><th>번호</th><th>이름</th><th>발표 횟수</th><th>우수발표</th><th>삭제</th></tr></thead>
                      <tbody>
                        {adminData.length === 0 ? <tr><td colSpan="5" className="pk-admin-empty">이 날짜에 기록 없음</td></tr> :
                          adminData.map(row => (
                            <tr key={row.student_id}>
                              <td className="pk-admin-num">{row.student_number}</td>
                              <td className="pk-admin-name">{row.name}</td>
                              <td><input type="number" className="pk-admin-input" defaultValue={row.count} min="0" onBlur={e => handleAdminUpdate(row.student_id,'count',e.target.value)}/></td>
                              <td><input type="number" className="pk-admin-input" defaultValue={row.special} min="0" max="1" onBlur={e => handleAdminUpdate(row.student_id,'special',e.target.value)}/></td>
                              <td><button className="pk-admin-del" onClick={() => handleAdminDelete(row.student_id)}>🗑</button></td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {adminView === 'stats' && (
                <div className="pk-admin-stats">
                  {statsData ? (<>
                    <div className="pk-stats-grid">
                      <div className="pk-stats-card pk-stats-today"><div className="pk-stats-emoji">📅</div><h3>오늘</h3><div className="pk-stats-number">{statsData.today_total||0}</div><div className="pk-stats-label">총 발표</div><div className="pk-stats-top">Top: {statsData.today_top?.name||'-'} ({statsData.today_top?.count||0}회)</div></div>
                      <div className="pk-stats-card pk-stats-week"><div className="pk-stats-emoji">📆</div><h3>이번 주</h3><div className="pk-stats-number">{statsData.week_total||0}</div><div className="pk-stats-label">총 발표</div><div className="pk-stats-top">Top: {statsData.week_top?.name||'-'} ({statsData.week_top?.count||0}회)</div></div>
                      <div className="pk-stats-card pk-stats-month"><div className="pk-stats-emoji">📋</div><h3>이번 달</h3><div className="pk-stats-number">{statsData.month_total||0}</div><div className="pk-stats-label">총 발표</div><div className="pk-stats-top">Top: {statsData.month_top?.name||'-'} ({statsData.month_top?.count||0}회)</div></div>
                    </div>
                    <div className="pk-stats-trend">
                      <h3>📈 학생별 발표 추세 (최근 7일)</h3>
                      <div className="pk-trend-list">
                        {(statsData.trends||[]).map(t => (
                          <div key={t.student_id} className="pk-trend-item">
                            <span className="pk-trend-name">{t.name}</span>
                            <div className="pk-trend-bars">
                              {(t.daily||[]).slice(-7).map((d,i) => (
                                <div key={i} className="pk-trend-day">
                                  <div className="pk-trend-bar" style={{height:`${Math.max(4,Math.min(40,(d.count||0)*10))}px`,background:d.count>0?'#4ECDC4':'#e2e8f0'}} title={`${d.date}: ${d.count}회`}/>
                                  <span className="pk-trend-date">{String(d.date).slice(5)}</span>
                                </div>
                              ))}
                            </div>
                            <span className={`pk-trend-arrow ${t.trend}`}>{t.trend==='up'?'▲':t.trend==='down'?'▼':'─'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>) : <div className="pk-admin-empty">통계 로딩 중...</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
