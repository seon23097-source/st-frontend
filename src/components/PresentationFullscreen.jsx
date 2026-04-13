import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { seatingAPI, studentsAPI, presentationAPI, groupsAPI, getToken } from '../utils/api';
import { getSocket } from '../utils/socket';
import './PresentationFullscreen.css';

// ─── 성장 단계: count로부터 계산 ─────────────────────────────
function getGrowthStage(count) {
  if (count <= 0) return 0;     // 씨앗
  if (count <= 2) return 1;     // 새싹
  if (count <= 4) return 2;     // 잎
  if (count <= 6) return 3;     // 꽃
  return 4;                     // 열매
}
const STAGE_LABELS = ['씨앗', '새싹', '잎', '꽃', '열매'];

// ─── 화분+식물 SVG ──────────────────────────────────────────
function PlantPot({ count, color, isSpecial }) {
  const stage = getGrowthStage(count);
  return (
    <svg viewBox="0 0 120 140" className="pf-pot-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`pot-${color.replace('#','')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.95"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.7"/>
        </linearGradient>
      </defs>

      {/* 흙 */}
      <ellipse cx="60" cy="100" rx="38" ry="6" fill="#5d4037"/>

      {/* 식물 (단계별) */}
      <g className={`pf-plant pf-plant-stage-${stage}`}>
        {stage === 0 && (
          // 씨앗 (흙 위에 작은 점)
          <ellipse cx="60" cy="98" rx="4" ry="3" fill="#8b6f47"/>
        )}
        {stage >= 1 && (
          // 줄기
          <path
            d={stage === 1
              ? "M60 100 Q60 92 60 86"
              : stage === 2
              ? "M60 100 Q60 85 60 70"
              : "M60 100 Q60 80 60 55"}
            stroke="#4caf50" strokeWidth="3" fill="none" strokeLinecap="round"
          />
        )}
        {stage === 1 && (
          // 새싹 - 작은 떡잎 두 개
          <>
            <ellipse cx="54" cy="86" rx="6" ry="3" fill="#81c784" transform="rotate(-30 54 86)"/>
            <ellipse cx="66" cy="86" rx="6" ry="3" fill="#81c784" transform="rotate(30 66 86)"/>
          </>
        )}
        {stage >= 2 && (
          // 잎 (양쪽에 큰 잎 4장)
          <>
            <ellipse cx="48" cy="78" rx="11" ry="5" fill="#66bb6a" transform="rotate(-25 48 78)"/>
            <ellipse cx="72" cy="78" rx="11" ry="5" fill="#66bb6a" transform="rotate(25 72 78)"/>
            <ellipse cx="46" cy="65" rx="12" ry="5.5" fill="#4caf50" transform="rotate(-20 46 65)"/>
            <ellipse cx="74" cy="65" rx="12" ry="5.5" fill="#4caf50" transform="rotate(20 74 65)"/>
          </>
        )}
        {stage >= 3 && (
          // 꽃 (5장 꽃잎)
          <g transform="translate(60 50)">
            <circle cx="0" cy="-9" r="6" fill="#f48fb1"/>
            <circle cx="9" cy="-3" r="6" fill="#f48fb1"/>
            <circle cx="6" cy="8" r="6" fill="#f48fb1"/>
            <circle cx="-6" cy="8" r="6" fill="#f48fb1"/>
            <circle cx="-9" cy="-3" r="6" fill="#f48fb1"/>
            <circle cx="0" cy="0" r="4" fill="#fff59d"/>
          </g>
        )}
        {stage >= 4 && (
          // 열매 (작은 빨간 열매들)
          <>
            <circle cx="42" cy="58" r="4.5" fill="#e53935"/>
            <circle cx="78" cy="62" r="4.5" fill="#e53935"/>
            <circle cx="50" cy="48" r="4" fill="#e53935"/>
            <circle cx="70" cy="44" r="4" fill="#e53935"/>
          </>
        )}
      </g>

      {/* 화분 */}
      <path
        d="M28 100 L92 100 L86 132 Q86 136 82 136 L38 136 Q34 136 34 132 Z"
        fill={`url(#pot-${color.replace('#','')})`}
        stroke={color} strokeWidth="1.5"
      />
      {/* 화분 테두리 */}
      <ellipse cx="60" cy="100" rx="32" ry="5" fill={color} stroke={color} strokeWidth="1"/>
      <ellipse cx="60" cy="100" rx="30" ry="3.5" fill="#3e2723" opacity="0.4"/>

      {/* 별 (우수발표) */}
      {isSpecial && (
        <g transform="translate(95 25)">
          <circle r="14" fill="#FFD700" stroke="#F59E0B" strokeWidth="1.5"/>
          <text x="0" y="6" textAnchor="middle" fontSize="18" fill="#fff">⭐</text>
        </g>
      )}

      {/* 카운트 배지 */}
      {count > 0 && (
        <g transform="translate(25 25)">
          <circle r="13" fill="#1f2937" stroke="#fff" strokeWidth="2"/>
          <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">{count}</text>
        </g>
      )}
    </svg>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────
export default function PresentationFullscreen() {
  const params = new URLSearchParams(window.location.search);
  const arrangementId = parseInt(params.get('arrangement_id'));
  const initialDate = params.get('date') || new Date().toISOString().split('T')[0];

  const [arrangement, setArrangement] = useState(null);
  const [grid, setGrid] = useState(Array(10).fill(null).map(() => Array(10).fill(null)));
  const [presentData, setPresentData] = useState({});
  const [groupsData, setGroupsData] = useState([]); // [{id, group_no, color, name, members}]
  const [groupScores, setGroupScores] = useState([]);
  const [date] = useState(initialDate);
  const [viewMode, setViewMode] = useState('teacher'); // teacher | student
  const [groupMode, setGroupMode] = useState(false);
  const [growAnim, setGrowAnim] = useState({}); // {studentId: timestamp} - 애니메이션 트리거
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const socketRef = useRef(null);

  // ─── 초기 로드 ────────────────────────────────
  useEffect(() => {
    if (!getToken()) {
      setError('로그인이 필요합니다. 메인 창에서 로그인 후 다시 열어주세요.');
      setLoading(false);
      return;
    }
    if (!arrangementId) {
      setError('자리배치 ID가 없습니다.');
      setLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line
  }, []);

  const loadAll = async () => {
    try {
      const [arr, daily, gs, gscores] = await Promise.all([
        seatingAPI.getArrangementDetails(arrangementId),
        presentationAPI.getDaily(date),
        groupsAPI.list(arrangementId),
        groupsAPI.scores(arrangementId, date),
      ]);
      const g = Array(10).fill(null).map(() => Array(10).fill(null));
      arr.positions.forEach((p) => {
        g[p.row_pos][p.col_pos] = { id: p.student_id, name: p.name, student_number: p.student_number };
      });
      setGrid(g);
      setArrangement(arr.arrangement);

      const map = {};
      daily.forEach((r) => { map[r.student_id] = { today: r.count || 0, special: r.special || 0 }; });
      setPresentData(map);

      setGroupsData(gs);
      setGroupScores(gscores);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Socket.IO 실시간 구독 ────────────────────
  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    socketRef.current = sock;

    const onUpdate = (payload) => {
      if (payload.date && payload.date !== date) return;
      if (payload.type === 'increment' || payload.type === 'decrement' || payload.type === 'special') {
        setPresentData((prev) => ({
          ...prev,
          [payload.student_id]: { today: payload.count, special: payload.special },
        }));
        if (payload.type === 'increment') {
          setGrowAnim((prev) => ({ ...prev, [payload.student_id]: Date.now() }));
        }
        // 모둠 점수 갱신
        groupsAPI.scores(arrangementId, date).then(setGroupScores).catch(() => {});
      } else if (payload.type === 'bulk') {
        // 일괄 갱신
        presentationAPI.getDaily(date).then((daily) => {
          const map = {};
          daily.forEach((r) => { map[r.student_id] = { today: r.count || 0, special: r.special || 0 }; });
          setPresentData(map);
        }).catch(() => {});
        groupsAPI.scores(arrangementId, date).then(setGroupScores).catch(() => {});
      }
    };

    sock.on('presentation:update', onUpdate);
    return () => {
      sock.off('presentation:update', onUpdate);
    };
  }, [arrangementId, date]);

  // ─── 학생 → 모둠 색 매핑 ──────────────────────
  const studentToGroupColor = useMemo(() => {
    const map = {};
    groupsData.forEach((g) => {
      g.members.forEach((m) => { map[m.student_id] = g.color; });
    });
    return map;
  }, [groupsData]);

  // ─── 클릭 핸들러 ──────────────────────────────
  const handleClick = useCallback(async (student) => {
    if (!student || student.type === 'furniture') return;
    // Optimistic update
    setPresentData((prev) => {
      const c = prev[student.id] || { today: 0, special: 0 };
      return { ...prev, [student.id]: { ...c, today: c.today + 1 } };
    });
    setGrowAnim((prev) => ({ ...prev, [student.id]: Date.now() }));
    try {
      await presentationAPI.increment(student.id, date, arrangementId);
    } catch (e) {
      // 실패 시 롤백
      setPresentData((prev) => {
        const c = prev[student.id] || { today: 0, special: 0 };
        return { ...prev, [student.id]: { ...c, today: Math.max(0, c.today - 1) } };
      });
    }
  }, [date, arrangementId]);

  const handleRightClick = useCallback(async (student, e) => {
    e.preventDefault();
    if (!student || student.type === 'furniture') return;
    setPresentData((prev) => {
      const c = prev[student.id] || { today: 0, special: 0 };
      return { ...prev, [student.id]: { ...c, special: c.special > 0 ? 0 : 1 } };
    });
    try {
      await presentationAPI.toggleSpecial(student.id, date, arrangementId);
    } catch (err) { /* socket으로 정정될 것 */ }
  }, [date, arrangementId]);

  // ─── 렌더 ────────────────────────────────────
  if (loading) return <div className="pf-loading">🌱 로딩 중...</div>;
  if (error) return <div className="pf-error">❌ {error}</div>;

  // 학생 시점: 그리드 통째로 180도 회전 → 좌우/상하 모두 반전
  const flipClass = viewMode === 'student' ? 'pf-flip' : '';

  return (
    <div className="pf-root">
      {/* 상단 컨트롤 바 */}
      <div className="pf-topbar">
        <div className="pf-topbar-left">
          <span className="pf-title">🌱 발표 정원</span>
          <span className="pf-arr">{arrangement?.title}</span>
        </div>
        <div className="pf-topbar-right">
          <div className="pf-toggle-group">
            <button
              className={`pf-toggle ${viewMode === 'teacher' ? 'pf-toggle-active' : ''}`}
              onClick={() => setViewMode('teacher')}
            >👩‍🏫 교사 시점</button>
            <button
              className={`pf-toggle ${viewMode === 'student' ? 'pf-toggle-active' : ''}`}
              onClick={() => setViewMode('student')}
            >🧑‍🎓 학생 시점</button>
          </div>
          <button
            className={`pf-btn ${groupMode ? 'pf-btn-on' : ''}`}
            onClick={() => setGroupMode((v) => !v)}
          >🎨 모둠 모드 {groupMode ? 'ON' : 'OFF'}</button>
          <button className="pf-btn pf-btn-close" onClick={() => window.close()}>✕ 닫기</button>
        </div>
      </div>

      {/* 시점 안내 라벨 */}
      <div className={`pf-stage-wrap ${flipClass}`}>
        <div className="pf-board-label">📺 칠판</div>
        <div className="pf-grid-area">
          {grid.map((row, i) => (
            <div key={i} className="pf-row">
              {row.map((cell, j) => {
                const isFurn = cell?.type === 'furniture';
                if (!cell || isFurn) {
                  return <div key={j} className={`pf-cell ${isFurn ? 'pf-cell-furn' : 'pf-cell-empty'}`}>
                    {isFurn && '🪑'}
                  </div>;
                }
                const sd = presentData[cell.id] || { today: 0, special: 0 };
                const cnt = sd.today;
                const isSp = sd.special > 0;
                const groupColor = groupMode ? (studentToGroupColor[cell.id] || '#9ca3af') : '#a78bfa';
                const animKey = growAnim[cell.id] || 0;
                return (
                  <div
                    key={j}
                    className="pf-cell pf-cell-student"
                    onClick={() => handleClick(cell)}
                    onContextMenu={(e) => handleRightClick(cell, e)}
                  >
                    {/* 학생 시점일 때 텍스트도 다시 뒤집어서 정상으로 보이게 */}
                    <div className={viewMode === 'student' ? 'pf-cell-inner pf-cell-inner-flip' : 'pf-cell-inner'}>
                      <div className="pf-pot-container" key={animKey}>
                        <PlantPot count={cnt} color={groupColor} isSpecial={isSp}/>
                      </div>
                      <div className="pf-name">{cell.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pf-back-label">📌 뒤편</div>
      </div>

      {/* 모둠 모드 하단 합산 점수 */}
      {groupMode && (
        <div className="pf-group-bar">
          {groupScores.length === 0 ? (
            <span className="pf-group-empty">등록된 모둠이 없습니다. 메인 화면에서 모둠을 만들어주세요.</span>
          ) : (
            groupScores.map((g) => (
              <div key={g.group_id} className="pf-group-score" style={{ borderColor: g.color }}>
                <span className="pf-group-color" style={{ background: g.color }}/>
                <span className="pf-group-name">{g.name || `${g.group_no}모둠`}</span>
                <span className="pf-group-points">{g.total_count}점</span>
                {g.total_special > 0 && <span className="pf-group-star">⭐{g.total_special}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
