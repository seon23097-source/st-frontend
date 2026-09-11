import React, { useState, useEffect } from 'react';
import { teachersAPI, studentsAPI, currentSchoolYear } from '../utils/api';
import './StudentManager.css';
import './AccountManager.css';

// ─── 학급 설정 localStorage 키 ───
const LS_CLASS_YEAR = 'classYear';
// classInfo를 연도별로 분리: 'classInfo_2026', 'classInfo_2025' 형태로 저장
const clsInfoKey = (year) => `classInfo_${year}`;
const loadCls = (year) => {
  try {
    const y = year || parseInt(localStorage.getItem(LS_CLASS_YEAR)) || new Date().getFullYear();
    const yearData = localStorage.getItem(clsInfoKey(y));
    if (yearData) return JSON.parse(yearData) || {};
    // 기존 'classInfo' 키 데이터가 있으면 현재 연도로 마이그레이션
    const legacy = localStorage.getItem('classInfo');
    if (legacy) {
      const parsed = JSON.parse(legacy) || {};
      localStorage.setItem(clsInfoKey(y), JSON.stringify(parsed));
      return parsed;
    }
    return {};
  } catch { return {}; }
};

// 초기화 미리보기에서 표 이름을 사람이 읽는 말로 (pmem st-app issue #77)
const RESET_LABEL = {
  students: '학생', evaluation_records: '평가 기록', evaluation_categories: '평가 항목',
  attendance_records: '출결 기록', attendance_notes: '출결 메모',
  attendance_events: '학사일정', attendance_semesters: '학기 설정',
  behavior_logs: '행동발달 기록', behavior_checklists: '행동발달 체크',
  checklist_topics: '체크리스트 주제', checklist_items: '체크리스트 항목',
  checklist_checks: '체크리스트 기록',
  seating_arrangements: '자리배치', seating_positions: '자리배치 좌석',
  seating_history: '자리배치 이력', seating_preferences: '자리배치 조건',
  groups: '모둠', student_groups: '모둠 배정',
  presentation_records: '발표 기록',
  grade_selections: '성적처리 선택', grade_results: '성적처리 평어',
};

function AccountManager({ teacher }) {
  // ── 기존 상태 ──
  const [teachers, setTeachers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTeacher, setNewTeacher]     = useState({ google_email: '', display_name: '' });
  const [error, setError]               = useState('');

  // ── 학급 설정 상태 ──
  const curY = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => curY - 5 + i);
  const [classYear, setClassYear] = useState(
    () => parseInt(localStorage.getItem(LS_CLASS_YEAR)) || curY
  );
  const [classInfo, setClassInfo] = useState(() => loadCls(parseInt(localStorage.getItem(LS_CLASS_YEAR)) || new Date().getFullYear()));
  const [clsSaved, setClsSaved]   = useState(false);

  // ── 초기화 상태 ──
  const [showReset,  setShowReset]  = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetBusy,  setResetBusy]  = useState(false);
  const [preview,    setPreview]    = useState(null);

  useEffect(() => { loadTeachers(); }, []);

  // 초기화 모달을 열면 무엇이 몇 행 지워지는지 서버에 먼저 물어본다.
  // 미리보기는 읽기 전용이다 — 지우지 않는다 (pmem st-app issue #77).
  useEffect(() => {
    if (!showReset) { setPreview(null); return; }
    let alive = true;
    studentsAPI.resetYearPreview(classYear, `${classYear}년 초기화`)
      .then(p => { if (alive) setPreview(p); })
      .catch(e => { if (alive) setPreview({ failed: e.message || '조회 실패' }); });
    return () => { alive = false; };
  }, [showReset, classYear]);

  const loadTeachers = async () => {
    try { setTeachers(await teachersAPI.getAll()); } catch {}
  };

  // 학급 설정 저장
  function saveClass(year, info) {
    const prevYear = classYear;
    localStorage.setItem(LS_CLASS_YEAR, String(year));
    // 연도별로 별도 키에 저장
    localStorage.setItem(clsInfoKey(year), JSON.stringify(info));
    setClassYear(year);
    setClassInfo(info);
    setClsSaved(true);
    setTimeout(() => setClsSaved(false), 1600);
    // 연도가 바뀌면 해당 연도의 classInfo 불러와서 state 갱신 후 reload
    if (year !== prevYear) {
      setClassInfo(loadCls(year));
      setTimeout(() => window.location.reload(), 500);
    }
  }

  // 학년도 초기화 (pmem st-app issue #77)
  //
  // ★ 순서가 핵심이다. 옛 구현은 localStorage 를 **먼저** 지운 뒤 학생 삭제에서
  //   외래키로 실패해, 이미 지운 평가 기록을 되돌릴 수 없었다(트랜잭션 없음).
  //   이제 서버가 한 트랜잭션으로 지우고, **성공 응답을 받은 뒤에만** 로컬을 지운다.
  //   실패하면 서버도 로컬도 그대로다.
  async function handleReset() {
    const expected = `${classYear}년 초기화`;
    if (resetInput.trim() !== expected) {
      alert(`"${expected}" 을 정확히 입력해주세요.`);
      return;
    }

    setResetBusy(true);
    try {
      // ① 서버에서 한 트랜잭션으로 삭제 (전부 성공하거나 전부 되돌아간다)
      const r = await studentsAPI.resetYear(classYear, expected);

      // ② 성공한 뒤에만 로컬 캐시·학급설정 정리.
      //    att_* / today_* 는 서버가 권위이고 이건 캐시다(일부는 옛 버전의 잔재).
      const prefixes = [
        'att_records', 'att_notes', 'att_events', 'att_vacation', 'att_semester',
        'today_memo_', 'today_todos_', 'today_notice_'
      ];
      prefixes.forEach(prefix => {
        Object.keys(localStorage)
          .filter(k => k.startsWith(prefix))
          .forEach(k => localStorage.removeItem(k));
      });
      localStorage.removeItem(clsInfoKey(classYear));

      setShowReset(false);
      setResetInput('');
      alert(`✅ ${classYear}학년도 데이터를 초기화했습니다 (${r.totalRows}행 삭제).\n페이지를 새로고침합니다.`);
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      alert('초기화에 실패했습니다.\n데이터는 지워지지 않았습니다 (트랜잭션이 되돌렸습니다).\n\n' + err.message);
    } finally {
      setResetBusy(false);
    }
  }


  // 계정 기능
  const handleAdd = async (e) => {
    e.preventDefault(); setError('');
    try {
      await teachersAPI.create(newTeacher);
      setNewTeacher({ google_email: '', display_name: '' });
      setShowAddModal(false);
      loadTeachers();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (t) => {
    if (!confirm(`${t.display_name} 계정을 삭제하시겠습니까?`)) return;
    try { await teachersAPI.delete(t.id); loadTeachers(); }
    catch (err) { alert(err.message); }
  };

  // 현재 학급 표시
  const displayBadge = [
    classYear ? `${classYear}학년도` : '',
    classInfo.grade ? `${classInfo.grade}학년` : '',
    classInfo.classNum ? `${classInfo.classNum}반` : '',
    classInfo.teacher ? `담임 ${classInfo.teacher}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="student-manager fade-in">

      {/* ══════════════════════════════════════════
          ① 학급 기준 설정 (새로 추가)
      ══════════════════════════════════════════ */}
      <div className="acm-card">
        <div className="acm-card-title">🏫 학급 기준 설정</div>
        <p className="acm-desc">
          기준 연도를 설정하면 출결·평가 등 모든 데이터가 해당 연도로 관리됩니다.
          연도가 달라도 같은 이름이면 다른 학생으로 처리됩니다.
        </p>

        {/* 기준 연도 */}
        <div className="acm-field">
          <label className="acm-label">기준 연도</label>
          <div className="acm-year-grid">
            {years.map(y => (
              <button key={y}
                className={`acm-year-btn ${classYear === y ? 'active' : ''}`}
                onClick={() => saveClass(y, classInfo)}
              >{y}년</button>
            ))}
          </div>
        </div>

        {/* 학년 / 반 */}
        <div className="acm-field">
          <label className="acm-label">학년 · 반</label>
          <div className="acm-inline">
            <select className="acm-select"
              value={classInfo.grade || ''}
              onChange={e => saveClass(classYear, { ...classInfo, grade: e.target.value })}
            >
              <option value="">학년 선택</option>
              {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
            </select>
            <select className="acm-select"
              value={classInfo.classNum || ''}
              onChange={e => saveClass(classYear, { ...classInfo, classNum: e.target.value })}
            >
              <option value="">반 선택</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}반</option>
              ))}
            </select>
          </div>
        </div>

        {/* 담임 이름 */}
        <div className="acm-field">
          <label className="acm-label">담임 이름</label>
          <input className="acm-input"
            placeholder="담임 선생님 성함"
            value={classInfo.teacher || ''}
            onChange={e => saveClass(classYear, { ...classInfo, teacher: e.target.value })}
          />
        </div>

        {displayBadge && <div className="acm-badge">{displayBadge}</div>}
        {clsSaved && <div className="acm-saved">✓ 저장됨</div>}
      </div>

      {/* ══════════════════════════════════════════
          ② 계정 관리
      ══════════════════════════════════════════ */}
      <div className="acm-card">
        <div className="acm-card-header-row">
          <div>
            <div className="acm-card-title">👤 계정 관리</div>
            <p className="acm-desc" style={{ margin: 0 }}>선생님 {teachers.length}명</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setError(''); setShowAddModal(true); }}>
            + 계정 추가
          </button>
        </div>

        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>구글 이메일</th>
                <th>이름</th>
                <th>권한</th>
                <th>생성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id}>
                  <td>{t.google_email || '-'}</td>
                  <td><strong>{t.display_name}</strong></td>
                  <td>{t.is_admin ? '🔑 관리자' : '👤 선생님'}</td>
                  <td className="td-date">{String(t.created_at).substring(0, 10)}</td>
                  <td className="td-actions">
                    {t.id !== teacher?.id
                      ? <button className="btn-text btn-deactivate" onClick={() => handleDelete(t)}>삭제</button>
                      : <span style={{ color: '#aaa', fontSize: 13 }}>본인</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          ③ 위험 구역: 학년도 초기화
      ══════════════════════════════════════════ */}
      <div className="acm-card acm-danger-card">
        <div className="acm-card-title">⚠️ 학년도 초기화</div>
        <p className="acm-desc" style={{ color: '#7f1d1d' }}>
          현재 기준 연도(<strong>{classYear}년</strong>)의 출결·메모·할일·학기 설정·행사일 등
          모든 데이터를 완전히 삭제합니다. <strong>이 작업은 되돌릴 수 없습니다.</strong>
        </p>
        <button className="acm-reset-btn" onClick={() => setShowReset(true)}>
          🗑 {classYear}학년도 데이터 초기화
        </button>
      </div>

      {/* ── 계정 추가 모달 ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>선생님 계정 추가</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAdd} className="modal-form">
              <div className="form-group">
                <label className="label">구글 이메일</label>
                <input className="input" type="email" placeholder="예: teacher@gmail.com"
                  value={newTeacher.google_email}
                  onChange={e => setNewTeacher({ ...newTeacher, google_email: e.target.value })}
                  required autoFocus />
              </div>
              <div className="form-group">
                <label className="label">이름</label>
                <input className="input" type="text" placeholder="예: 3학년 2반 이선생"
                  value={newTeacher.display_name}
                  onChange={e => setNewTeacher({ ...newTeacher, display_name: e.target.value })}
                  required />
              </div>
              {error && <p className="error-message">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 초기화 확인 모달 ── */}
      {showReset && (
        <div className="modal-overlay" onClick={() => { setShowReset(false); setResetInput(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '2px solid #ef4444' }}>
              <h3 style={{ color: '#ef4444' }}>⚠️ 초기화 최종 확인</h3>
              <button className="modal-close" onClick={() => { setShowReset(false); setResetInput(''); }}>×</button>
            </div>
            <div className="modal-form">
              <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <p style={{ fontSize: 13.5, color: '#ef4444', fontWeight: 800, margin: '0 0 6px' }}>
                  ❗ 삭제 후 복구 불가능합니다
                </p>
                <p style={{ fontSize: 12.5, color: '#7f1d1d', margin: '0 0 8px' }}>
                  {classYear}학년도의 학생과 그 학생에 딸린 모든 기록(출결·평가·행동발달·
                  체크리스트·자리배치·발표·성적처리), 그리고 학사일정·학기 설정이 삭제됩니다.<br />
                  <strong>오늘 메모·할일·공지는 삭제하지 않습니다.</strong>
                </p>
                {/* 실제로 몇 행이 지워지는지 서버에 물어서 보여준다 — 읽기 전용 조회다 */}
                {preview === null && (
                  <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0 }}>삭제 대상 확인 중…</p>
                )}
                {preview && preview.failed && (
                  <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0 }}>
                    삭제 대상을 확인하지 못했습니다: {preview.failed}
                  </p>
                )}
                {preview && !preview.failed && (
                  <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>
                      삭제 대상 {preview.totalRows}행
                    </div>
                    {preview.totalRows === 0 ? (
                      <div>지울 데이터가 없습니다.</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                        {[...preview.steps, ...preview.cascade]
                          .filter(x => x.rows > 0)
                          .map(x => (
                            <span key={x.table}>
                              {RESET_LABEL[x.table] || x.table} {x.rows}
                            </span>
                          ))}
                      </div>
                    )}
                    {preview.fkCheck && preview.fkCheck.some(f => !f.ok) && (
                      <div style={{ marginTop: 6, fontWeight: 800 }}>
                        ⚠️ DB 삭제규칙이 예상과 달라 실패할 수 있습니다. 관리자에게 알려주세요.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">
                  확인하려면 아래에 정확히 입력하세요:&nbsp;
                  <code style={{ background: '#f1f5f9', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>
                    {classYear}년 초기화
                  </code>
                </label>
                <input className="input" style={{ borderColor: '#ef4444' }}
                  placeholder={`${classYear}년 초기화`}
                  value={resetInput}
                  onChange={e => setResetInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReset()}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline"
                  onClick={() => { setShowReset(false); setResetInput(''); }}>취소</button>
                <button type="button"
                  className="btn"
                  style={{
                    background: resetInput === `${classYear}년 초기화` ? '#ef4444' : '#fca5a5',
                    color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer'
                  }}
                  onClick={handleReset}
                  disabled={resetBusy || resetInput !== `${classYear}년 초기화`}
                >{resetBusy ? '삭제 중…' : '영구 삭제'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountManager;
