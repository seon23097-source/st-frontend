import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import EvaluationManager from './EvaluationManager';
import StudentManager from './StudentManager';
import AccountManager from './AccountManager';
import Today from './Today';
import Attendance, { AttendanceSidebar } from './Attendance';
import Checklist from './Checklist';
import SeatingArrangement from './SeatingArrangement';
import BehaviorDevelopment from './BehaviorDevelopment';
import GradeProcess from './GradeProcess';
import Album from './Nas';
import PresentationKing from './PresentationKing';
import { categoriesAPI, studentsAPI, evaluationsAPI, removeToken, removeTeacher, getTeacher, attendanceAPI, currentSchoolYear } from '../utils/api';
import * as XLSX from 'xlsx';
import ThemeSelector from './ThemeSelector';
import './Dashboard.css';

// ─── 메뉴 탭 정의 ───────────────────────────────────────────
const MENU_TABS = [
  { key: 'today',            label: '오늘',      icon: '☀️',  path: '/today' },
  { key: 'attendance',       label: '출결',      icon: '📋',  path: '/attendance' },
  { key: 'evaluation',       label: '평가 기록', icon: '📊',  path: null }, // 카테고리 라우팅 사용
  { key: 'seating',          label: '자리배치',  icon: '🪑',  path: '/seating' },
  { key: 'presentationking', label: '발표왕',    icon: '👑',  path: '/presentationking' },
  { key: 'checklist',        label: '체크리스트', icon: '✅',  path: '/checklist' },
  { key: 'behavior',         label: '행동발달',   icon: '🌱',  path: '/behavior' },
  { key: 'grade',            label: '성적처리',   icon: '📝',  path: '/grade' },
  { key: 'nas',            label: 'NAS',       icon: '💾',  path: '/nas' },
];

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function getTodayLabel() {
  const now = new Date();
  return `${now.getMonth() + 1}월 ${now.getDate()}일 (${DAY_KR[now.getDay()]})`;
}

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', max_score: 100 });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const teacher = getTeacher();

  // 출결 실시간 반영용 records + 선택 날짜
  const [attRecords, setAttRecords] = useState({});
  const [attMonth, setAttMonth]     = useState(new Date().getMonth() + 1);
  const [attDay,   setAttDay]       = useState(null);
  // 학급 설정 실시간 반영
  const [classInfo, setClassInfo] = useState(() => {
    try {
      const y = parseInt(localStorage.getItem('classYear')) || new Date().getFullYear();
      const yearData = localStorage.getItem(`classInfo_${y}`);
      if (yearData) return JSON.parse(yearData) || {};
      // 기존 키 호환
      return JSON.parse(localStorage.getItem('classInfo')) || {};
    } catch { return {}; }
  });
  const [classYear, setClassYear] = useState(
    () => parseInt(localStorage.getItem('classYear')) || new Date().getFullYear()
  );

  // localStorage 변경 감지 (출결 탭에서 기록 변경 시 사이드바 즉시 반영)
  useEffect(() => {
    function syncStorage(e) {
      if (e.key === 'att_records') {
        // Attendance.jsx가 사이드바 실시간 반영을 위해 localStorage에도 저장하므로 읽어옴
        try { setAttRecords(JSON.parse(e.newValue) || {}); } catch {}
      }
      if (e.key === 'classInfo') {
        try { setClassInfo(JSON.parse(e.newValue) || {}); } catch {}
      }
      if (e.key === 'classYear') {
        setClassYear(parseInt(e.newValue) || new Date().getFullYear());
      }
    }
    window.addEventListener('storage', syncStorage);
    const timer = setInterval(() => {
      try {
        // 출결 records는 Attendance.jsx가 localStorage에 미러링하므로 읽어옴
        const r = JSON.parse(localStorage.getItem('att_records')) || {};
        setAttRecords(r);
        const attState = JSON.parse(localStorage.getItem('att_ui_state') || '{}');
        if (attState.month) setAttMonth(attState.month);
        if (attState.day !== undefined) setAttDay(attState.day);
        const cy2 = parseInt(localStorage.getItem('classYear')) || new Date().getFullYear();
        const ciRaw = localStorage.getItem(`classInfo_${cy2}`) || localStorage.getItem('classInfo');
        const ci = JSON.parse(ciRaw) || {};
        setClassInfo(ci);
        const cy = parseInt(localStorage.getItem('classYear')) || new Date().getFullYear();
        setClassYear(cy);
      } catch {}
    }, 1500);
    return () => { window.removeEventListener('storage', syncStorage); clearInterval(timer); };
  }, []);
  const fileInputRef = useRef(null);

  // 현재 활성 탭 계산
  const currentPath = location.pathname;
  const activeTab = (() => {
    if (currentPath.startsWith('/today')) return 'today';
    if (currentPath.startsWith('/attendance')) return 'attendance';
    if (currentPath.startsWith('/category')) return 'evaluation';
    if (currentPath.startsWith('/evaluation')) return 'evaluation';
    if (currentPath.startsWith('/seating')) return 'seating';
    if (currentPath.startsWith('/presentationking')) return 'presentationking';
    if (currentPath.startsWith('/checklist')) return 'checklist';
    if (currentPath.startsWith('/behavior')) return 'behavior';
    if (currentPath.startsWith('/grade')) return 'grade';
    if (currentPath.startsWith('/nas')) return 'nas';
    return 'today';
  })();
  const activeTabInfo = MENU_TABS.find(t => t.key === activeTab);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => { loadData(classYear); }, [classYear]);

  const loadData = async (year) => {
    const y = year || classYear;
    try {
      const [categoriesData, studentsData] = await Promise.all([
        categoriesAPI.getAll(y),
        studentsAPI.getAll(y)
      ]);
      setCategories(categoriesData);
      setStudents(studentsData);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // ===== 전체 엑셀 내보내기 (카테고리별 시트) =====
  const handleExportAll = async () => {
    if (categories.length === 0) { alert('내보낼 카테고리가 없습니다.'); return; }
    try {
      const wb = XLSX.utils.book_new();
      for (const cat of categories) {
        const evals = await evaluationsAPI.getByCategory(cat.id);

        // 날짜+제목 컬럼 구성
        const colMap = {};
        evals.forEach(e => {
          const dateStr = String(e.evaluation_date).substring(0, 10);
          const key = `${dateStr}__${e.title || ''}`;
          if (!colMap[key]) colMap[key] = { date: dateStr, title: e.title || '', key };
        });
        const cols = Object.values(colMap).sort((a, b) => new Date(b.date) - new Date(a.date));

        // 헤더 2행
        const header1 = ['이름', '평균', ...cols.map(c => c.title || '제목없음')];
        const header2 = ['', '', ...cols.map(c => {
          const parts = c.date.split('-');
          return `${parts[1]}/${parts[2]}`;
        })];

        // 데이터 행
        const rows = students.map(student => {
          const studentEvals = evals.filter(e => e.student_id === student.id);
          const avg = studentEvals.length > 0
            ? (studentEvals.reduce((s, e) => s + parseFloat(e.score), 0) / studentEvals.length).toFixed(1)
            : '';
          const scores = cols.map(col => {
            const list = evals.filter(e =>
              e.student_id === student.id &&
              String(e.evaluation_date).substring(0, 10) === col.date &&
              (e.title || '') === col.title
            );
            return list.map(r => parseFloat(r.score)).join(', ') || '';
          });
          return [student.name, avg, ...scores];
        });

        const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...rows]);
        // 시트 이름은 31자 제한
        const sheetName = cat.name.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
      const today = new Date().toISOString().substring(0, 10);
      XLSX.writeFile(wb, `전체평가_${today}.xlsx`);
    } catch (error) {
      alert('내보내기 실패: ' + error.message);
    }
  };

  // ===== 출결 엑셀 내보내기 (DB 기반) =====
  const handleAttExport = async () => {
    try {
      const [recordsData, notesData, eventsData] = await Promise.all([
        attendanceAPI.getRecords(classYear),
        attendanceAPI.getNotes(classYear),
        attendanceAPI.getEvents(classYear),
      ]);
      const records  = recordsData  || {};
      const notes    = notesData    || {};
      const events   = eventsData   || {};
      const SCHOOL_MONTHS = [3,4,5,6,7,8,9,10,11,12,1,2];
      const pad2 = n => String(n).padStart(2,'0');
      const realYear = (base, m) => m <= 2 ? base + 1 : base;
      const TYPE_MAP = { field:'체험학습', approved:'출석인정', sick:'병결', early:'조퇴', other:'기타' };
      const wb = XLSX.utils.book_new();
      SCHOOL_MONTHS.forEach(m => {
        const y = realYear(classYear, m);
        const last = new Date(y, m, 0).getDate();
        const weekdays = Array.from({length:last},(_,i)=>i+1)
          .filter(d=>{ const w=new Date(y,m-1,d).getDay(); return w!==0&&w!==6; });
        if (weekdays.length === 0) return;
        const header = ['번호','이름', ...weekdays.map(d => `${m}/${d}`)];
        const rows = students.map(s => {
          const row = [s.student_number, s.name];
          weekdays.forEach(d => {
            const dk = `${y}-${pad2(m)}-${pad2(d)}`;
            const t = records[s.id]?.[dk];
            const evtName = events[dk];
            if (evtName) row.push(typeof evtName==='string' ? evtName.charAt(0) : '행');
            else row.push(t ? TYPE_MAP[t] || '' : '');
          });
          return row;
        });
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, `${m}월`);
      });
      const noteRows = [['날짜','번호','이름','유형','사유']];
      students.forEach(s => {
        SCHOOL_MONTHS.forEach(m => {
          const y = realYear(classYear, m);
          const last = new Date(y, m, 0).getDate();
          Array.from({length:last},(_,i)=>i+1).forEach(d => {
            const pad2 = n => String(n).padStart(2,'0');
            const dk = `${y}-${pad2(m)}-${pad2(d)}`;
            const t = records[s.id]?.[dk];
            const note = notes[`${s.id}_${dk}`];
            if (t && note) noteRows.push([dk, s.student_number, s.name, TYPE_MAP[t]||t, note]);
          });
        });
      });
      const wsNotes = XLSX.utils.aoa_to_sheet(noteRows);
      XLSX.utils.book_append_sheet(wb, wsNotes, '사유메모');
      XLSX.writeFile(wb, `출결_${classYear}년도.xlsx`);
    } catch(e) { alert('내보내기 오류: ' + e.message); }
  };

  // ===== 출결 엑셀 가져오기 (DB 기반) =====
  const handleAttImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, {type:'binary'});
        const realYear = (base, m) => m <= 2 ? base + 1 : base;
        const pad2 = n => String(n).padStart(2,'0');
        const TYPE_REV = { '체험학습':'field', '출석인정':'approved', '병결':'sick', '조퇴':'early', '기타':'other', '체험':'field' };
        const toSave = [];
        [3,4,5,6,7,8,9,10,11,12,1,2].forEach(m => {
          const ws = wb.Sheets[`${m}월`];
          if (!ws) return;
          const rows = XLSX.utils.sheet_to_json(ws, {header:1});
          if (rows.length < 2) return;
          const header = rows[0];
          const y = realYear(classYear, m);
          rows.slice(1).forEach(row => {
            const studentNum = row[0];
            const student = students.find(s => s.student_number == studentNum);
            if (!student) return;
            header.slice(2).forEach((h, i) => {
              const val = row[i + 2];
              if (!val || !h) return;
              const [, d] = String(h).split('/');
              if (!d) return;
              const dk = `${y}-${pad2(m)}-${pad2(parseInt(d))}`;
              const type = TYPE_REV[String(val).trim()];
              if (type) toSave.push({ student_id: student.id, record_date: dk, att_type: type });
            });
          });
        });
        if (toSave.length > 0) {
          await attendanceAPI.saveRecord && await Promise.all(
            toSave.map(r => attendanceAPI.saveRecord(r.student_id, r.record_date, r.att_type))
          );
        }
        alert('출결 가져오기 완료! 출결 탭을 새로 열어보세요.');
      } catch(e) { alert('가져오기 오류: ' + e.message); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // ===== 전체 엑셀 가져오기 (덮어쓰기) =====
  const handleImportAll = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const studentMap = {}; students.forEach(s => { studentMap[s.name] = s; });
      const catMap = {}; categories.forEach(c => { catMap[c.name] = c; });

      // 1단계: 파싱
      const sheetsToImport = [];
      const errors = [];
      for (const sheetName of wb.SheetNames) {
        const cat = catMap[sheetName];
        if (!cat) { errors.push(`시트 "${sheetName}": 카테고리 없음 (건너뜀)`); continue; }
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 3) continue;
        const titleRow = rows[0]; const dateRow = rows[1];
        const colCount = titleRow.length - 2;
        const year = new Date().getFullYear();
        const parsedCols = [];
        for (let i = 0; i < colCount; i++) {
          const title = String(titleRow[i + 2] || '').trim();
          const dateStr = String(dateRow[i + 2] || '').trim();
          const parts = dateStr.split('/');
          let date = new Date().toISOString().split('T')[0];
          if (parts.length === 2) date = `${year}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
          parsedCols.push({ title, date });
        }
        const records = [];
        for (let r = 2; r < rows.length; r++) {
          const row = rows[r]; const name = String(row[0] || '').trim();
          const student = studentMap[name]; if (!student) continue;
          for (let c = 0; c < colCount; c++) {
            const val = row[c + 2];
            if (val === '' || val === undefined || val === null) continue;
            const scores = String(val).split(',').map(s => parseFloat(s.trim())).filter(s => !isNaN(s));
            for (const score of scores) {
              if (score < 0 || score > cat.max_score) continue;
              records.push({ student_id: student.id, category_id: cat.id, score, evaluation_date: parsedCols[c].date, title: parsedCols[c].title });
            }
          }
        }
        if (records.length > 0) sheetsToImport.push({ cat, records });
      }

      if (sheetsToImport.length === 0) { alert('가져올 데이터가 없습니다.' + (errors.length > 0 ? '\n\n' + errors.join('\n') : '')); return; }

      // 2단계: 덮어쓰기 확인
      const catNames = sheetsToImport.map(s => `• ${s.cat.name}`).join('\n');
      const totalCount = sheetsToImport.reduce((sum, s) => sum + s.records.length, 0);
      if (!confirm(`다음 카테고리의 기존 평가 기록을 모두 삭제하고\n새 데이터(${totalCount}개)로 덮어씁니다.\n\n${catNames}\n\n계속하시겠습니까?`)) return;

      // 3단계: 삭제 후 재삽입
      let totalImported = 0;
      for (const { cat, records } of sheetsToImport) {
        await evaluationsAPI.deleteAllByCategory(cat.id);
        for (const rec of records) { await evaluationsAPI.create(rec); totalImported++; }
      }
      alert(`가져오기 완료!\n총 ${totalImported}개 점수 덮어쓰기${errors.length > 0 ? '\n\n' + errors.join('\n') : ''}`);
    } catch (error) {
      alert('파일 읽기 실패: ' + error.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.name.trim()) { alert('카테고리 이름을 입력해주세요.'); return; }
    if (newCategory.max_score <= 0) { alert('만점은 0보다 커야 합니다.'); return; }
    try {
      const created = await categoriesAPI.create(newCategory);
      setCategories([...categories, created]);
      setNewCategory({ name: '', max_score: 100 });
      setShowCategoryModal(false);
      navigate(`/category/${created.id}`);
    } catch (error) {
      alert(error.message || '카테고리 생성에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      removeToken();
      removeTeacher();
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* 사이드바 - 항상 표시 */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-top">
          {/* ── 탭 전환 드롭다운 ── */}
          <div className="sidebar-brand" ref={menuRef}>
            <button
              className={`menu-tab-btn ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen(prev => !prev)}
            >
              <span className="menu-tab-icon">{activeTabInfo?.icon}</span>
              <span className="menu-tab-label">
                {activeTab === 'today' ? getTodayLabel() : activeTabInfo?.label}
              </span>
              <span className="menu-tab-arrow">{menuOpen ? '▲' : '▼'}</span>
            </button>

            {menuOpen && (
              <ul className="menu-tab-dropdown">
                {MENU_TABS.map(tab => (
                  <li key={tab.key}>
                    <button
                      className={`menu-tab-item ${activeTab === tab.key ? 'active' : ''}`}
                      onClick={() => {
                        setMenuOpen(false);
                        if (tab.path) {
                          navigate(tab.path);
                        } else if (tab.key === 'evaluation') {
                          // 평가 기록: 첫 카테고리로 이동 or 평가 기본 화면
                          if (categories.length > 0) navigate(`/category/${categories[0].id}`);
                          else navigate('/evaluation');
                        }
                      }}
                    >
                      <span className="menu-tab-item-icon">{tab.icon}</span>
                      <span className="menu-tab-item-label">
                        {tab.key === 'today' ? getTodayLabel() : tab.label}
                      </span>
                      {activeTab === tab.key && <span className="menu-tab-check">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 학급 정보 (계정관리에서 설정한 값 실시간 반영) */}
          {(classInfo.grade || classInfo.classNum || classInfo.teacher) && (
            <div style={{ padding: '3px 16px 10px', fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
              {classYear}년도
              {classInfo.grade ? ` ${classInfo.grade}학년` : ''}
              {classInfo.classNum ? ` ${classInfo.classNum}반` : ''}
              {classInfo.teacher ? ` · ${classInfo.teacher}` : ''}
            </div>
          )}

          {/* 평가 카테고리 - 평가 기록 탭일 때만 표시 */}
          {activeTab === 'evaluation' && (
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span className="sidebar-section-title">평가 카테고리</span>
              <button className="btn-icon" onClick={() => setShowCategoryModal(true)} title="새 카테고리">+</button>
            </div>
            <nav className="category-nav">
              {categories.length === 0 ? (
                <div className="empty-state">
                  <p>카테고리가 없습니다</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCategoryModal(true)}>
                    첫 카테고리 만들기
                  </button>
                </div>
              ) : (
                categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`category-nav-item ${currentPath === `/category/${cat.id}` ? 'active' : ''}`}
                    onClick={() => navigate(`/category/${cat.id}`)}
                  >
                    <span className="category-name">{cat.name}</span>
                    <span className="category-max-score">{cat.max_score}점</span>
                    <div className="category-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-category-action btn-category-delete"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`'${cat.name}' 카테고리를 삭제하시겠습니까?\n\n평가 기록이 있으면 삭제할 수 없습니다.`)) {
                            try {
                              await categoriesAPI.delete(cat.id);
                              loadData(classYear);
                            } catch (error) {
                              alert(error.message || '카테고리 삭제 실패: ' + error.message);
                            }
                          }
                        }}
                        title="카테고리 삭제"
                      >×</button>
                    </div>
                  </button>
                ))
              )}
            </nav>
          </div>
          )} {/* evaluation 탭 조건부 끝 */}

          {/* 출결 탭일 때: 사이드바 출결 현황 위젯 */}
          {activeTab === 'attendance' && (
            <AttendanceSidebar students={students} records={attRecords} selectedMonth={attMonth} selectedDay={attDay} />
          )}

          {/* 체크리스트 탭일 때: 사이드바는 Checklist 컴포넌트 내부에서 처리 */}
        </div>
        <div className="sidebar-bottom">
          <button
            className={`sidebar-menu-item ${currentPath === '/students' ? 'active' : ''}`}
            onClick={() => navigate('/students')}
          >
            👥 학생 관리
          </button>
          <button
            className={`sidebar-menu-item ${currentPath === '/accounts' ? 'active' : ''}`}
            onClick={() => navigate('/accounts')}
          >
            🔑 계정 관리
          </button>
          <button className="sidebar-menu-item" onClick={activeTab === 'attendance' ? handleAttExport : handleExportAll}>
            ⬇ {activeTab === 'attendance' ? '출결 엑셀 내보내기' : '전체 엑셀 내보내기'}
          </button>
          <button className="sidebar-menu-item" onClick={() => fileInputRef.current.click()}>
            ⬆ {activeTab === 'attendance' ? '출결 엑셀 가져오기' : '전체 엑셀 가져오기'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={activeTab === 'attendance' ? handleAttImport : handleImportAll} />
          <button className="sidebar-menu-item sidebar-logout" onClick={handleLogout}>
            🚪 로그아웃
          </button>
          <ThemeSelector />
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="dashboard-main">
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/presentationking" element={<PresentationKing />} />
          <Route path="/seating" element={<SeatingArrangement />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/behavior" element={<BehaviorDevelopment />} />
          <Route path="/grade" element={<GradeProcess />} />
          <Route path="/nas" element={<Nas />} />
          <Route path="/" element={
            <div className="welcome-screen">
              <div className="welcome-content">
                <h2>안녕하세요, {teacher?.display_name}님! 👋</h2>
                <p>{categories.length === 0
                  ? '왼쪽에서 평가 카테고리를 추가해 시작하세요.'
                  : '왼쪽에서 평가 카테고리를 선택하세요.'}</p>
                <div className="welcome-stats">
                  <div className="stat-card">
                    <div className="stat-number">{students.length}</div>
                    <div className="stat-label">학생</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-number">{categories.length}</div>
                    <div className="stat-label">평가 항목</div>
                  </div>
                </div>
              </div>
            </div>
          } />
          <Route path="/evaluation" element={
            <div className="welcome-screen">
              <div className="welcome-content">
                <h2>평가 기록 📊</h2>
                <p>왼쪽에서 + 버튼을 눌러 평가 카테고리를 추가하세요.</p>
              </div>
            </div>
          } />
          <Route path="/students" element={
            <StudentManager students={students} onUpdate={() => loadData(classYear)} classYear={classYear} />
          } />
          <Route path="/accounts" element={
            <AccountManager teacher={teacher} />
          } />
          <Route path="/category/:categoryId" element={
            <EvaluationManager students={students} categories={categories} onCategoryUpdate={loadData} />
          } />
        </Routes>
      </main>

      {/* 카테고리 생성 모달 */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>새 평가 카테고리</h3>
              <button className="modal-close" onClick={() => setShowCategoryModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateCategory} className="modal-form">
              <div className="form-group">
                <label className="label">카테고리 이름</label>
                <input type="text" className="input"
                  value={newCategory.name}
                  onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="예: 줄넘기, 받아쓰기, 수학단원평가"
                  autoFocus required />
              </div>
              <div className="form-group">
                <label className="label">만점</label>
                <input type="number" className="input"
                  value={newCategory.max_score}
                  onChange={e => setNewCategory({ ...newCategory, max_score: parseInt(e.target.value) || 0 })}
                  min="1" required />
                <p className="hint">예: 받아쓰기 10점, 수학 100점</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCategoryModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">생성</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
