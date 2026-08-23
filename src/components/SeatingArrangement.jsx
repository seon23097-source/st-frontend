import React, { useState, useEffect, useCallback, useRef } from 'react';
import { seatingAPI, studentsAPI, currentSchoolYear } from '../utils/api';
import './SeatingArrangement.css';

// pairMap[a] 에 'b 와 언제 짝이었나'를 쌓는다. {studentId: Map<partnerId, [배치제목, ...]}
// 횟수만 세면 "왜 중복이라는 거냐"에 답할 수 없어서 어느 배치였는지까지 남긴다.
function bumpPair(pairMap, a, b, label) {
  if(!pairMap[a]) pairMap[a] = new Map();
  const list = pairMap[a].get(b) || [];
  list.push(label);
  pairMap[a].set(b, list);
}

function SeatingArrangement() {
  const [arrangements,        setArrangements]        = useState([]);
  const [selectedArrangement, setSelectedArrangement] = useState(null);
  const [students,            setStudents]            = useState([]);
  const studentsRef = useRef([]);
  useEffect(() => { studentsRef.current = students; }, [students]);
  const [grid,                setGrid]                = useState(Array(10).fill(null).map(()=>Array(10).fill(null)));
  const [unassignedStudents,  setUnassignedStudents]  = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [showTitleModal,      setShowTitleModal]      = useState(false);
  const [newTitle,            setNewTitle]            = useState('');
  const [draggedStudent,      setDraggedStudent]      = useState(null);
  const [showFullScreen,      setShowFullScreen]      = useState(false);
  const [viewMode,            setViewMode]            = useState('teacher');

  // 설정
  const [frontStudents,    setFrontStudents]    = useState([]);
  const [separateStudents, setSeparateStudents] = useState([]);
  const [showFrontModal,   setShowFrontModal]   = useState(false);
  const [showSeparateModal,setShowSeparateModal]= useState(false);
  const [separatePair,     setSeparatePair]     = useState({student1:null,student2:null});

  // 자동배치
  const [autoArrangeMode, setAutoArrangeMode] = useState('pair');
  const [showAutoModal,   setShowAutoModal]   = useState(false);
  const [numColumns,      setNumColumns]      = useState(3);
  const [groupSize,       setGroupSize]       = useState(4);

  // 이력 팝업
  const [historyPopup, setHistoryPopup] = useState(null);

  // 떠드는 학생 표시
  const [noisyStudents, setNoisyStudents] = useState([]);  // [studentId, ...]
  const [noisyClickMode, setNoisyClickMode] = useState(false);
  const [milkClickMode, setMilkClickMode] = useState(false);
  const [showNoisyAlert, setShowNoisyAlert] = useState(true);

  // 줄별 앉은 횟수 통계
  const [rowStats, setRowStats] = useState({});  // {studentId: {row1:n, row2:n, row3:n, row4:n}}

  // 중복 짝 맵 — 2인 짝만 집계. 값은 '몇 번 짝이었나'
  const [duplicatePairMap, setDuplicatePairMap] = useState({});  // {studentId: Map<partnerId, count>}

  // 배치 상세 캐시 {arrangementId: detail}
  // 저장 전까지 배치 상세는 바뀌지 않는다. 캐시가 없으면 배치를 고를 때마다 전 배치를
  // 다시 읽어서 백엔드 throttler(default 100req/1s)에 걸린다 — 실제로 429 가 났다.
  const detailCache = useRef(new Map());
  const fetchDetail = useCallback(async (id, fresh = false) => {
    if (!fresh && detailCache.current.has(id)) return detailCache.current.get(id);
    const d = await seatingAPI.getArrangementDetails(id);
    detailCache.current.set(id, d);
    return d;
  }, []);

  // 자주 떠드는 학생 (전체 배치 집계)
  const [frequentNoisyStudents, setFrequentNoisyStudents] = useState([]);  // [{id, count}]

  // Ollama 대화창
  const [showAiPanel,  setShowAiPanel]  = useState(false);
  const [aiMessages,   setAiMessages]   = useState([]);
  const [aiInput,      setAiInput]      = useState('');
  const [aiLoading,    setAiLoading]    = useState(false);
  const aiEndRef = useRef(null);

  // 토스트
  const [toast,      setToast]      = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, type='info') => {
    if(toastTimer.current) clearTimeout(toastTimer.current);
    setToast({message,type});
    toastTimer.current = setTimeout(()=>setToast(null),3000);
  },[]);

  useEffect(()=>{ loadData(); },[]);
  useEffect(()=>{ aiEndRef.current?.scrollIntoView({behavior:'smooth'}); },[aiMessages]);

  const loadData = async () => {
    try {
      const [arr, stu] = await Promise.all([seatingAPI.getArrangements(), studentsAPI.getAll()]);
      setArrangements(arr); setStudents(stu); setUnassignedStudents(stu);
    } catch(e) { console.error('데이터 로드 실패:', e); }
    finally { setLoading(false); }
  };

  // ── 중복 짝 감지 + 줄별 통계 계산 ──
  const computeDuplicatesAndRowStats = useCallback(async () => {
    if(!arrangements.length || !studentsRef.current.length || !selectedArrangement) return;
    const pairMap = {};
    const stats = {};
    studentsRef.current.forEach(s => { stats[s.id] = {row1:0, row2:0, row3:0, row4:0}; });

    // 모든 이전 배치에서 줄별 통계 + 짝 이력 수집.
    // 캐시가 대부분 받아내고, 남은 것도 한꺼번에 던지지 않고 6개씩 끊는다.
    // 전부 동시에 던졌더니 배치를 빠르게 여러 번 고를 때 429 가 났다(증보 II §19).
    // '이전' 배치만 본다. 예전에는 현재 것만 빼고 전부를 봐서, 과거 배치를 열면
    // 그보다 나중에 만들어진 배치까지 짝 이력에 섞였다 — 그날 기준으로는 아직
    // 일어나지 않은 짝이 중복으로 표시됐다(줄 통계·떠드는 학생 집계도 같은 문제).
    const cutoff = new Date(selectedArrangement.created_at).getTime();
    const targets = arrangements.filter(a =>
      a.id !== selectedArrangement.id && new Date(a.created_at).getTime() < cutoff,
    );
    const details = [];
    for (let i = 0; i < targets.length; i += 6) {
      const chunk = targets.slice(i, i + 6);
      details.push(...await Promise.all(
        chunk.map(a => fetchDetail(a.id).then(d => d && { ...d, _label: a.title }).catch(() => null)),
      ));
    }
    const failedCount = details.filter(d => !d).length;

    const noisyCount = {};  // {studentId: count}
    for(const detail of details) {
      if(!detail) continue;
      // 줄별 통계
      detail.positions.forEach(p => {
        if(stats[p.student_id]) {
          if(p.row_pos >= 6) stats[p.student_id].row1++;
          else if(p.row_pos >= 4) stats[p.student_id].row2++;
          else if(p.row_pos >= 2) stats[p.student_id].row3++;
          else stats[p.student_id].row4++;
        }
      });
      // 떠드는 학생 집계
      (detail.preferences?.noisy_students || []).forEach(sid => {
        noisyCount[sid] = (noisyCount[sid] || 0) + 1;
      });
      // 짝 이력 — '바로 옆에 앉았는가'만 본다(상하좌우 직접 인접).
      // 예전에는 연결군이 정확히 2명일 때만 기록했는데, 표시 쪽은 연결군 전체를
      // 검사해서 3연속의 양 끝처럼 붙지도 않은 조합이 중복으로 잡혔다.
      // 오른쪽·아래만 보면 같은 쌍을 두 번 세지 않는다.
      const gridSnap = Array(10).fill(null).map(()=>Array(10).fill(null));
      detail.positions.forEach(p => { gridSnap[p.row_pos][p.col_pos] = p.student_id; });
      for(let r=0; r<10; r++) {
        for(let c=0; c<10; c++) {
          const a = gridSnap[r][c];
          if(!a) continue;
          [[0,1],[1,0]].forEach(([dr,dc]) => {
            const b = gridSnap[r+dr]?.[c+dc];
            if(!b) return;
            bumpPair(pairMap, a, b, detail._label);
            bumpPair(pairMap, b, a, detail._label);
          });
        }
      }
    }

    // 현재 배치의 떠드는 학생도 포함
    noisyStudents.forEach(sid => {
      noisyCount[sid] = (noisyCount[sid] || 0) + 1;
    });
    // 2회 이상 떠든 학생 집계
    const frequent = Object.entries(noisyCount)
      .filter(([,count]) => count >= 2)
      .map(([id, count]) => ({id: parseInt(id), count}))
      .sort((a,b) => b.count - a.count);
    setFrequentNoisyStudents(frequent);

    setDuplicatePairMap(pairMap);
    setRowStats(stats);

    // 조회가 일부 실패하면 그만큼 짝 이력이 비는데, 화면상으로는 '중복 없음'과 구별되지 않는다.
    if(failedCount > 0) {
      showToast(`이전 배치 ${failedCount}개를 못 읽었습니다. 짝 이력이 일부 빠졌을 수 있습니다.`, 'error');
    }
  }, [arrangements, selectedArrangement, noisyStudents, showToast, fetchDetail]);

  useEffect(() => { if(selectedArrangement) computeDuplicatesAndRowStats(); }, [selectedArrangement, computeDuplicatesAndRowStats]);

  // 현재 그리드에서 중복 짝인 셀 판별 — 바로 옆(상하좌우)만 본다.
  const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
  const isDuplicatePairCell = useCallback((row, col) => {
    const cur = grid[row]?.[col];
    if(!cur) return false;
    const myHistory = duplicatePairMap[cur.id];
    if(!myHistory || myHistory.size === 0) return false;
    return DIRS.some(([dr,dc]) => {
      const n = grid[row+dr]?.[col+dc];
      return n && myHistory.has(n.id);
    });
  }, [grid, duplicatePairMap]);

  // 현재 배치에서 '이전에 짝이었던' 조합과 그게 어느 배치였는지.
  // ⚠ 만 띄우면 왜 중복인지 알 수 없어서, 근거를 배너로 같이 보여준다.
  const currentDuplicatePairs = useCallback(() => {
    const seen = new Set(); const out = [];
    for(let i=0;i<10;i++) for(let j=0;j<10;j++) {
      const cur = grid[i]?.[j];
      if(!cur) continue;
      const hist = duplicatePairMap[cur.id];
      if(!hist || hist.size === 0) continue;
      DIRS.forEach(([dr,dc]) => {
        const n = grid[i+dr]?.[j+dc];
        if(!n) return;
        const when = hist.get(n.id);
        if(!when || !when.length) return;
        const key = [cur.id, n.id].sort((x,y)=>x-y).join('-');
        if(seen.has(key)) return;
        seen.add(key);
        out.push({ key, a: cur.name, b: n.name, when });
      });
    }
    return out.sort((x,y) => y.when.length - x.when.length);
  }, [grid, duplicatePairMap]);

  // 떠드는 학생 토글
  const noisyInitialLoad = useRef(true);
  const toggleNoisyStudent = useCallback((studentId) => {
    setNoisyStudents(prev => {
      const exists = prev.includes(studentId);
      if(exists) return prev.filter(id => id !== studentId);
      return [...prev, studentId];
    });
  }, []);

  // 떠드는 학생 변경 시 자동 저장
  useEffect(() => {
    if(noisyInitialLoad.current) { noisyInitialLoad.current = false; return; }
    if(!selectedArrangement) return;
    seatingAPI.savePreferences(selectedArrangement.id, {
      front_students: frontStudents,
      separate_students: separateStudents,
      noisy_students: noisyStudents,
    }).then(() => detailCache.current.delete(selectedArrangement.id)).catch(() => {});
  }, [noisyStudents]);

  const isNoisyStudent = useCallback((studentId) => {
    return noisyStudents.includes(studentId);
  }, [noisyStudents]);

  const isMilkStudent = useCallback((studentId) => {
    const s = students.find(st => st.id === studentId);
    return s?.drinks_milk === true;
  }, [students]);

  const toggleMilkStudent = useCallback(async (studentId) => {
    const s = students.find(st => st.id === studentId);
    if (!s) return;
    const newVal = !s.drinks_milk;
    try {
      await studentsAPI.update(studentId, { drinks_milk: newVal });
      setStudents(prev => prev.map(st =>
        st.id === studentId ? { ...st, drinks_milk: newVal } : st
      ));
      showToast(newVal ? `${s.name} 우유 표시 추가 🥛` : `${s.name} 우유 표시 해제`, 'info');
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  }, [students, showToast]);

  // 떠드는 학생 인사이트 생성
  const getNoisyInsights = useCallback(() => {
    if(noisyStudents.length === 0) return null;
    // 현재 그리드에서 떠드는 학생 인접 여부 확인
    const adjacentPairs = [];
    for(let i=0; i<10; i++) {
      for(let j=0; j<10; j++) {
        const cur = grid[i]?.[j];
        if(!cur || !isNoisyStudent(cur.id)) continue;
        [[0,1],[1,0]].forEach(([dr,dc]) => {
          const nr=i+dr, nc=j+dc;
          if(nr<10 && nc<10 && grid[nr]?.[nc] && isNoisyStudent(grid[nr][nc].id)) {
            const names = [cur.name, grid[nr][nc].name].sort();
            const key = names.join('-');
            if(!adjacentPairs.some(p => p.key === key)) {
              adjacentPairs.push({key, names});
            }
          }
        });
      }
    }
    return { adjacentPairs };
  }, [noisyStudents, grid, isNoisyStudent]);

  // ── BFS 짝/모둠 탐지 ──
  const findGroupForCell = (row, col) => {
    if(!grid[row][col]) return [];
    const visited = Array(10).fill(null).map(()=>Array(10).fill(false));
    const group=[]; const queue=[[row,col]]; visited[row][col]=true;
    while(queue.length>0){
      const [r,c]=queue.shift(); group.push({row:r,col:c,student:grid[r][c]});
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<10&&nc>=0&&nc<10&&grid[nr][nc]&&!visited[nr][nc]){ visited[nr][nc]=true; queue.push([nr,nc]); }
      });
    }
    return group;
  };

  const getCellType = (row,col) => {
    const g=findGroupForCell(row,col);
    if(g.length===2) return 'pair';
    if(g.length>=3) return 'group';
    return null;
  };

  // ── 이력 조회 ──
  // 팝업은 회피 로직과 '같은' 소스(duplicatePairMap)를 쓴다.
  // 예전에는 서버 seating_history 를 따로 읽어 최근 5건만 보여줬는데, 그쪽은
  // 모둠 동석과 지난 학년도까지 섞여 있어서 화면에 뜨는 이름과 실제 회피 기준이 달랐다.
  const checkHistory = (row,col) => {
    const cur=grid[row][col];
    if(!cur){ setHistoryPopup(null); return; }
    const hist=duplicatePairMap[cur.id];
    if(!hist||hist.size===0){ setHistoryPopup(null); return; }
    const partners=[...hist.entries()]
      .map(([pid,when])=>({ id:pid, count:when.length, when, name: students.find(s=>s.id===pid)?.name || `${pid}번` }))
      .sort((a,b)=> b.count-a.count || a.name.localeCompare(b.name,'ko'));
    setHistoryPopup({row, col, studentName: cur.name, partners});
  };

  const loadArrangementDetails = async (id) => {
    try {
      const data=await fetchDetail(id, true);   // 여는 배치는 항상 최신
      setSelectedArrangement(data.arrangement);
      const newGrid=Array(10).fill(null).map(()=>Array(10).fill(null));
      data.positions.forEach(p=>{ newGrid[p.row_pos][p.col_pos]={id:p.student_id,name:p.name,student_number:p.student_number}; });
      setGrid(newGrid);
      const assignedIds=data.positions.map(p=>p.student_id);
      setUnassignedStudents(students.filter(s=>!assignedIds.includes(s.id)));
      setFrontStudents(data.preferences.front_students||[]);
      setSeparateStudents(data.preferences.separate_students||[]);
      setNoisyStudents(data.preferences.noisy_students||[]);
      noisyInitialLoad.current = true;
    } catch(e){ console.error('배치 상세 로드 실패:',e); }
  };

  const handleCreateArrangement = async (e) => {
    e.preventDefault();
    try {
      const arr=await seatingAPI.createArrangement(newTitle);
      setNewTitle(''); setShowTitleModal(false);
      await loadData();
      setSelectedArrangement(arr);
      setGrid(Array(10).fill(null).map(()=>Array(10).fill(null)));
      setUnassignedStudents(students);
      setAiMessages([]);
    } catch(e){ showToast('배치 생성 실패: '+e.message,'error'); }
  };

  const handleDeleteArrangement = async (id) => {
    if(!confirm('이 자리배치를 삭제하시겠습니까?')) return;
    try {
      await seatingAPI.deleteArrangement(id);
      detailCache.current.delete(id);
      if(selectedArrangement?.id===id){ setSelectedArrangement(null); setGrid(Array(10).fill(null).map(()=>Array(10).fill(null))); }
      await loadData();
    } catch(e){ showToast('삭제 실패: '+e.message,'error'); }
  };

  const handleSavePositions = async () => {
    if(!selectedArrangement) return;
    const positions=[];
    for(let i=0;i<10;i++) for(let j=0;j<10;j++)
      if(grid[i][j]) positions.push({student_id:grid[i][j].id,row_pos:i,col_pos:j});
    try {
      await seatingAPI.savePositions(selectedArrangement.id,positions);
      detailCache.current.delete(selectedArrangement.id);   // 저장했으니 캐시 무효
      showToast('저장되었습니다! ✓','success');
    } catch(e){ showToast('저장 실패: '+e.message,'error'); }
  };

  // ── 드래그앤드롭 ──
  const handleDragStart = (e,student,fromGrid=false,row=null,col=null) => {
    setDraggedStudent({student,fromGrid,row,col});
    setHistoryPopup(null);
    e.dataTransfer.effectAllowed='move';
  };
  const handleDrop = async (e,toRow,toCol) => {
    e.preventDefault();
    if(!draggedStudent) return;
    const newGrid=grid.map(r=>[...r]);
    const target=newGrid[toRow][toCol];
    if(draggedStudent.fromGrid) newGrid[draggedStudent.row][draggedStudent.col]=target;
    newGrid[toRow][toCol]=draggedStudent.student;
    setGrid(newGrid);
    if(!draggedStudent.fromGrid){
      setUnassignedStudents(prev=>prev.filter(s=>s.id!==draggedStudent.student.id));
      if(target){ const fs=students.find(s=>s.id===target.id); if(fs) setUnassignedStudents(prev=>[...prev,fs]); }
    }
    setDraggedStudent(null);
    setTimeout(()=>checkHistory(toRow,toCol),100);
  };
  const handleRemoveFromGrid = (row,col) => {
    const s=grid[row][col]; if(!s) return;
    const newGrid=grid.map(r=>[...r]); newGrid[row][col]=null; setGrid(newGrid);
    const fs=students.find(st=>st.id===s.id); if(fs) setUnassignedStudents(prev=>[...prev,fs]);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; };

  // ── 행 공정성 자동배치 (rowStats 활용) ──
  const calculateRowFairness = (studentList) => {
    // rowStats: {studentId: {row1(칠판):n, row2:n, row3:n, row4(뒤):n}}
    // 칠판쪽(row1)에 많이 앉은 학생은 이번에 뒤쪽으로, 뒤쪽(row4)에 많이 앉은 학생은 앞쪽으로
    const scored = studentList.map(student => {
      const st = rowStats[student.id];
      if(!st) return {student, score: Math.random()};
      const total = st.row1 + st.row2 + st.row3 + st.row4;
      if(total === 0) return {student, score: Math.random()};
      // 가중 평균: 앞쪽(row1=1, row2=2)에 많이 앉았으면 score가 높음 → 이번에 뒤쪽 배치
      const weightedAvg = (st.row1 * 1 + st.row2 * 2 + st.row3 * 3 + st.row4 * 4) / total;
      return {student, score: weightedAvg + Math.random() * 0.3};
    });
    // score 높은 학생(이전에 앞쪽 많이 앉음)이 배열 앞 → 뒤쪽 행부터 채워짐
    scored.sort((a,b) => b.score - a.score);
    return scored.map(s => s.student);
  };

  const executeAutoArrange = async () => {
    setShowAutoModal(false);
    try {
      const allStudents=[...students];
      const frontList=allStudents.filter(s=>frontStudents.includes(s.id));
      const regulars=allStudents.filter(s=>!frontStudents.includes(s.id));
      const newGrid=Array(10).fill(null).map(()=>Array(10).fill(null));
      const fairOrderedRegulars=calculateRowFairness(regulars);
      const allToArrange=[...fairOrderedRegulars];
      // 이미 계산된 duplicatePairMap 사용 (모든 이전 배치의 짝 이력)
      const shouldSeparate=(id1,id2)=>separateStudents.some(pair=>(pair[0]===id1&&pair[1]===id2)||(pair[0]===id2&&pair[1]===id1));
      const pairCount=(id1,id2)=>(duplicatePairMap[id1]?.get(id2) || []).length;  // 몇 번 짝이었나 (0 = 처음)
      const isCellEmpty=(r,c)=>r>=0&&r<8&&c>=0&&c<10&&!newGrid[r][c]; // 행 0~7만 사용 (8,9행 제외)
      let si=0;
      let reusedPairs=0, forcedPairs=0;  // 조용히 떨어지지 않도록 집계

      if(autoArrangeMode==='pair'){
        const cw=3,tw=numColumns*cw-1,sc=Math.floor((10-tw)/2);
        const columns=[];
        for(let i=0;i<numColumns;i++){ const c1=sc+i*cw,c2=c1+1; if(c2<10) columns.push([c1,c2]); }
        const rows=[]; for(let r=7;r>=0;r-=2) rows.push(r); // 7부터 시작
        const frontQueue=[...frontList];
        for(const row of rows){
          for(const cg of columns){
            if(frontQueue.length===0) break;
            if(isCellEmpty(row,cg[0])){ const s1=frontQueue.shift(); if(!s1) continue; newGrid[row][cg[0]]=s1;
              if(frontQueue.length>0&&isCellEmpty(row,cg[1])){ const s2=frontQueue.shift(); if(s2) newGrid[row][cg[1]]=s2; } }
          }
          if(frontQueue.length===0) break;
        }
        for(const row of rows){
          for(const cg of columns){
            if(si>=allToArrange.length) break;
            if(isCellEmpty(row,cg[0])){
              const s1=allToArrange[si++]; if(!s1) continue; newGrid[row][cg[0]]=s1;
              if(si<allToArrange.length&&isCellEmpty(row,cg[1])){
                // 분리조건을 지키는 후보 중 '가장 덜 만난' 짝을 고른다.
                // 예전에는 한 번이라도 만났으면 전부 똑같이 버리고 아무나 집었기 때문에,
                // 이력이 포화되면 사실상 무작위가 됐다.
                let s2=null, s2idx=-1, best=Infinity;
                for(let i=si;i<allToArrange.length;i++){
                  const c=allToArrange[i];
                  if(shouldSeparate(s1.id,c.id)) continue;
                  const n=pairCount(s1.id,c.id);
                  if(n<best){ best=n; s2=c; s2idx=i; if(n===0) break; }
                }
                if(s2){ allToArrange.splice(s2idx,1); if(best>0) reusedPairs++; }
                else if(si<allToArrange.length){ s2=allToArrange[si++]; forcedPairs++; }
                if(s2) newGrid[row][cg[1]]=s2;
              }
            }
          }
          if(si>=allToArrange.length) break;
        }
      } else {
        const gr=Math.ceil(groupSize/2),cw=3,tw=numColumns*cw-1,sc=Math.floor((10-tw)/2);
        const columns=[];
        for(let i=0;i<numColumns;i++){ const c1=sc+i*cw,c2=c1+1; if(c1<10&&c2<10) columns.push([c1,c2]); }
        const bg=gr+1; const blockRows=[]; let sr=7; // 7부터 시작
        while(sr-gr+1>=0){ blockRows.push(sr); sr-=bg; }
        const fq=[...frontList];
        for(const bsr of blockRows){
          for(const cp of columns){
            if(si>=allToArrange.length&&fq.length===0) break;
            const gm=[];
            while(fq.length>0&&gm.length<groupSize) gm.push(fq.shift());
            while(gm.length<groupSize&&si<allToArrange.length) gm.push(allToArrange[si++]);
            if(gm.length===0) continue;
            let mi=0;
            for(let r=0;r<gr;r++){
              const tr=bsr-r; if(tr<0) break;
              for(let c=0;c<2&&mi<gm.length;c++){ const tc=cp[c]; if(isCellEmpty(tr,tc)) newGrid[tr][tc]=gm[mi++]; }
            }
          }
          if(si>=allToArrange.length&&fq.length===0) break;
        }
      }
      setGrid(newGrid);
      const assignedIds=newGrid.flat().filter(c=>c).map(s=>s.id);
      setUnassignedStudents(allStudents.filter(s=>!assignedIds.includes(s.id)));
      const notes=[];
      if(reusedPairs>0) notes.push(`이전 짝 재사용 ${reusedPairs}쌍`);
      if(forcedPairs>0) notes.push(`분리조건 미충족 ${forcedPairs}쌍`);
      showToast(
        notes.length
          ? `자동 배치 완료 (${notes.join(', ')}). 저장 버튼을 눌러주세요.`
          : '자동 배치 완료! 저장 버튼을 눌러주세요.',
        notes.length ? 'info' : 'success',
      );
    } catch(e){ showToast('자동 배치 중 오류: '+e.message,'error'); }
  };

  const handleSavePreferences = async () => {
    if(!selectedArrangement) return;
    try {
      await seatingAPI.savePreferences(selectedArrangement.id,{front_students:frontStudents,separate_students:separateStudents,noisy_students:noisyStudents});
      detailCache.current.delete(selectedArrangement.id);
      showToast('설정 저장됨 ✓','success');
    } catch(e){ showToast('저장 실패: '+e.message,'error'); }
  };

  // ── Ollama AI 대화 ──
  const handleAiSend = async () => {
    if(!aiInput.trim()||aiLoading||!selectedArrangement) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages(prev=>[...prev,{role:'user',content:userMsg}]);
    setAiLoading(true);
    try {
      // 현재 배치 상태를 번호 기준으로 전달
      const currentPositions=[];
      for(let i=0;i<10;i++) for(let j=0;j<10;j++)
        if(grid[i][j]) currentPositions.push({student_number:grid[i][j].student_number,row:i,col:j});

      const result = await seatingAPI.aiChat({
        arrangement_id: selectedArrangement.id,
        message: userMsg,
        current_positions: currentPositions,
        preferences: {front_students:frontStudents, separate_students:separateStudents},
        rows: 10, cols: 10,
        year: currentSchoolYear(),
      });

      // AI 배치 결과를 그리드에 반영
      if(result.positions&&result.positions.length>0){
        const newGrid=Array(10).fill(null).map(()=>Array(10).fill(null));
        result.positions.forEach(p=>{
          const student=students.find(s=>s.student_number===p.student_number);
          if(student&&p.row>=0&&p.row<10&&p.col>=0&&p.col<10)
            newGrid[p.row][p.col]={id:student.id,name:student.name,student_number:student.student_number};
        });
        setGrid(newGrid);
        const assignedIds=result.positions.map(p=>{ const s=students.find(st=>st.student_number===p.student_number); return s?.id; }).filter(Boolean);
        setUnassignedStudents(students.filter(s=>!assignedIds.includes(s.id)));
      }

      setAiMessages(prev=>[...prev,{
        role:'assistant',
        content: result.explanation || '배치가 완료됐어요.',
        hasPositions: result.positions?.length>0,
      }]);
    } catch(e){
      setAiMessages(prev=>[...prev,{role:'assistant',content:'오류가 발생했어요: '+e.message,isError:true}]);
    } finally {
      setAiLoading(false);
    }
  };

  if(loading) return (
    <div className="seating-loading"><div className="spinner"/><p>로딩 중...</p></div>
  );

  return (
    <div className="seating-container">
      {toast&&<div className={`seating-toast seating-toast-${toast.type}`}>{toast.message}</div>}

      {/* ── 왼쪽 사이드바 ── */}
      <aside className="seating-sidebar">
        <div className="seating-sidebar-header">
          <h2>자리배치</h2>
          <button className="btn-icon" onClick={()=>setShowTitleModal(true)} title="새 배치">+</button>
        </div>
        <div className="seating-list">
          {arrangements.length===0
            ? <div className="empty-state"><p>배치가 없습니다</p></div>
            : arrangements.map(arr=>(
              <div key={arr.id} className={`seating-item ${selectedArrangement?.id===arr.id?'selected':''}`}
                onClick={()=>loadArrangementDetails(arr.id)}>
                <span className="seating-title">{arr.title}</span>
                <button className="btn-delete-seating" onClick={e=>{e.stopPropagation();handleDeleteArrangement(arr.id);}}>×</button>
              </div>
            ))
          }
        </div>
      </aside>

      {/* ── 메인 영역 ── */}
      <main className="seating-main">
        {!selectedArrangement ? (
          <div className="seating-empty"><h2>🪑 자리배치</h2><p>왼쪽에서 배치를 선택하거나 새로 만들어보세요.</p></div>
        ) : (
          <>
            <div className="seating-toolbar">
              <h2>{selectedArrangement.title}</h2>
              <div className="seating-actions">
                <button className="btn btn-outline btn-sm" onClick={()=>setShowFrontModal(true)}>앞자리 설정</button>
                <button className="btn btn-outline btn-sm" onClick={()=>setShowSeparateModal(true)}>분리/붙이기</button>
                <button className="btn btn-outline btn-sm" onClick={()=>setShowAutoModal(true)}>자동 배치</button>
                <button className={`btn btn-outline btn-sm ${noisyClickMode?'noisy-toggle-active':''}`}
                  onClick={()=>setNoisyClickMode(prev=>!prev)}
                  title="떠드는 학생을 클릭하여 표시합니다">
                  🔊 {noisyClickMode ? '표시 중...' : '떠드는 학생'}
                </button>
                <button className={`btn btn-outline btn-sm ${milkClickMode?'milk-toggle-active':''}`}
                  onClick={()=>setMilkClickMode(prev=>!prev)}
                  title="우유 먹는 학생을 클릭하여 표시합니다 (모든 배치 공통 적용)">
                  🥛 {milkClickMode ? '표시 중...' : '우유 학생'}
                </button>
                <button className="btn btn-outline btn-sm" disabled
                  style={{opacity:0.5, cursor:'not-allowed'}}>
                  🤖 AI 배치 (개발중)
                </button>
                <button className="btn btn-outline btn-sm" onClick={()=>setShowFullScreen(true)}>전체화면</button>
                <button className="btn btn-primary btn-sm" onClick={handleSavePositions}>저장</button>
              </div>
            </div>

            {/* 자주 떠드는 학생 알림 배너 */}
            {frequentNoisyStudents.length > 0 && (
              <div className="noisy-alert-banner" style={{marginBottom:'8px',background:'linear-gradient(90deg,#fef3c7,#fff7ed)',border:'1px solid #f59e0b'}}>
                <span className="noisy-alert-icon">📢</span>
                <div className="noisy-alert-content">
                  <div className="noisy-alert-title">자주 떠드는 학생 (2회 이상 표시됨)</div>
                  <div className="noisy-alert-text">
                    {frequentNoisyStudents.map((n,i) => {
                      const s = students.find(st=>st.id===n.id);
                      return s ? <span key={n.id}>{i>0 && ', '}<strong>{s.name}</strong>({n.count}회)</span> : null;
                    })}
                    {' — 자리 배치 시 분리를 권장합니다.'}
                  </div>
                </div>
              </div>
            )}

            {/* 이전에 짝이었던 조합 — ⚠ 의 근거 */}
            {currentDuplicatePairs().length > 0 && (
              <div className="noisy-alert-banner" style={{marginBottom:'8px',background:'linear-gradient(90deg,#fee2e2,#fff1f2)',border:'1px solid #ef4444'}}>
                <span className="noisy-alert-icon">⚠️</span>
                <div className="noisy-alert-content">
                  <div className="noisy-alert-title">이전에 짝이었던 조합 ({currentDuplicatePairs().length}쌍)</div>
                  <div className="noisy-alert-text">
                    {currentDuplicatePairs().map(d => (
                      <div key={d.key} style={{lineHeight:1.7}}>
                        <strong>{d.a} ↔ {d.b}</strong>
                        <span style={{opacity:0.85}}>{' — '}{d.when.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 현재 배치 떠드는 학생 알림 배너 */}
            {showNoisyAlert && getNoisyInsights() && (
              <div className="noisy-alert-banner">
                <span className="noisy-alert-icon">⚠️</span>
                <div className="noisy-alert-content">
                  <div className="noisy-alert-title">이번 배치 떠드는 학생</div>
                  <div className="noisy-alert-text">
                    {noisyStudents.map((id,i) => {
                      const s = students.find(st=>st.id===id);
                      return s ? <span key={id}>{i>0 && ', '}<strong>{s.name}</strong></span> : null;
                    })}
                    {getNoisyInsights().adjacentPairs.length > 0 && (
                      <span style={{display:'block',marginTop:'4px',color:'#dc2626',fontWeight:600}}>
                        🚨 현재 인접 배치: {getNoisyInsights().adjacentPairs.map(p=>p.names.join(' ↔ ')).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <button className="noisy-alert-dismiss" onClick={()=>setShowNoisyAlert(false)}>×</button>
              </div>
            )}

            <div className="seating-workspace">
              {/* 그리드 */}
              <div className="seating-grid-wrapper">
                <div className="grid-label grid-label-top">게시판 (뒤)</div>
                <div className="grid-container">
                  <div className="grid-label grid-label-left">복도</div>
                  <div className={`seating-grid ${noisyClickMode?'noisy-click-mode':''} ${milkClickMode?'milk-click-mode':''}`}>
                    {grid.map((row,i)=>(
                      <div key={i} className="grid-row">
                        {row.map((cell,j)=>{
                          const cellType=cell?getCellType(i,j):null;
                          const dupPair=cell?isDuplicatePairCell(i,j):false;
                          const noisy=cell?isNoisyStudent(cell.id):false;
                          const milk=cell?isMilkStudent(cell.id):false;
                          return (
                            <div key={`${i}-${j}`}
                              className={`grid-cell ${cell?'occupied':''} ${cellType==='pair'?'has-pair':''} ${cellType==='group'?'has-group':''} ${dupPair?'duplicate-pair':''} ${noisy?'noisy-student':''} ${milk?'milk-student':''}`}
                              onDragOver={handleDragOver}
                              onDrop={e=>handleDrop(e,i,j)}
                              onMouseEnter={()=>cell&&!draggedStudent&&checkHistory(i,j)}
                              onMouseLeave={()=>setHistoryPopup(null)}
                              onClick={()=>{
                                if(noisyClickMode && cell) {
                                  toggleNoisyStudent(cell.id);
                                  setShowNoisyAlert(true);
                                } else if(milkClickMode && cell) {
                                  toggleMilkStudent(cell.id);
                                }
                              }}>
                              {cell&&(
                                <div className="student-card-wrapper">
                                  <div className="student-card"
                                    draggable={!noisyClickMode&&!milkClickMode} onDragStart={e=>!noisyClickMode&&!milkClickMode&&handleDragStart(e,cell,true,i,j)}>
                                    {cell.name}
                                  </div>
                                  {!noisyClickMode&&!milkClickMode && <button className="btn-remove-cell" onClick={e=>{e.stopPropagation();handleRemoveFromGrid(i,j);}}>×</button>}
                                  {dupPair&&<span title="이전에 짝이었던 학생과 붙어 있음" style={{position:'absolute',top:'-5px',left:'-5px',width:'16px',height:'16px',borderRadius:'50%',background:'#ef4444',color:'#fff',fontSize:'10px',display:'flex',alignItems:'center',justifyContent:'center',zIndex:6,pointerEvents:'none'}}>⚠</span>}
                                  {noisy&&<span style={{position:'absolute',top:'-5px',right:'-5px',fontSize:'11px',zIndex:6,pointerEvents:'none'}}>🔊</span>}
                                  {milk&&<span style={{position:'absolute',bottom:'-5px',right:'-5px',fontSize:'11px',zIndex:6,pointerEvents:'none'}}>🥛</span>}
                                </div>
                              )}
                              {historyPopup?.row===i&&historyPopup?.col===j&&historyPopup.partners.length>0&&!draggedStudent&&(
                                <div className={`history-popup${i<=2?' below':''}`}>
                                  <div className="history-popup-count">
                                    지금까지 짝 {historyPopup.partners.length}명
                                  </div>
                                  <div className="history-popup-chips">
                                    {historyPopup.partners.map(p=>(
                                      <span key={p.id} className="history-popup-chip">
                                        {p.name}{p.count>1?` ×${p.count}`:''}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="grid-label grid-label-right">창문</div>
                </div>
                <div className="grid-label grid-label-bottom">칠판</div>
              </div>

              {/* 오른쪽 패널: AI 대화창 or 학생 목록 */}
              {showAiPanel ? (
                <div className="seating-ai-panel">
                  <div className="ai-panel-header">
                    <span>🤖 AI 자리배치</span>
                    <span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Ollama 14B</span>
                  </div>
                  <div className="ai-messages">
                    {aiMessages.length===0&&(
                      <div className="ai-welcome">
                        <p>자리배치를 자연어로 요청해보세요.</p>
                        <div className="ai-examples">
                          <button onClick={()=>setAiInput('4명씩 2×2 모둠으로 배치해줘')}>4명씩 2×2 모둠</button>
                          <button onClick={()=>setAiInput('이전에 함께 앉은 적 없는 짝으로 배치해줘')}>이전 짝 피하기</button>
                          <button onClick={()=>setAiInput('앞자리 학생들을 칠판 가까이 배치해줘')}>앞자리 우선</button>
                        </div>
                      </div>
                    )}
                    {aiMessages.map((msg,i)=>(
                      <div key={i} className={`ai-message ${msg.role}`}>
                        <div className="ai-message-content" style={msg.isError?{color:'var(--danger)'}:{}}>
                          {msg.content}
                          {msg.hasPositions&&<div className="ai-applied-badge">✓ 그리드에 반영됨</div>}
                        </div>
                      </div>
                    ))}
                    {aiLoading&&<div className="ai-message assistant"><div className="ai-loading-dots"><span/><span/><span/></div></div>}
                    <div ref={aiEndRef}/>
                  </div>
                  <div className="ai-input-row">
                    <input className="ai-input" value={aiInput} onChange={e=>setAiInput(e.target.value)}
                      placeholder="배치 요청을 입력하세요..."
                      onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); handleAiSend(); } }}
                      disabled={aiLoading}/>
                    <button className="ai-send-btn" onClick={handleAiSend} disabled={aiLoading||!aiInput.trim()}>전송</button>
                  </div>
                  <p style={{fontSize:'11px',color:'var(--text-tertiary)',padding:'4px 12px 8px',margin:0}}>
                    저장 버튼을 눌러야 배치가 저장됩니다
                  </p>
                </div>
              ) : (
                <div className="student-list-panel">
                  <h3>미배치 학생 ({unassignedStudents.length}명)</h3>
                  <div className="student-list">
                    {unassignedStudents.length===0
                      ? <div className="all-assigned-badge">✓ 모든 학생이 배치됐습니다</div>
                      : unassignedStudents.map(s=>(
                        <div key={s.id} className={`student-card draggable ${isNoisyStudent(s.id)?'noisy-marked':''} ${isMilkStudent(s.id)?'milk-marked':''}`}
                          draggable onDragStart={e=>handleDragStart(e,s)}>
                          {s.student_number}. {s.name} {isNoisyStudent(s.id) && '🔊'}{isMilkStudent(s.id) && '🥛'}
                        </div>
                      ))
                    }
                  </div>

                  {/* 떠드는 학생 관리 */}
                  {noisyStudents.length > 0 && (
                    <div className="row-stats-section">
                      <h4>🔊 떠드는 학생 ({noisyStudents.length}명)</h4>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'8px'}}>
                        {noisyStudents.map(id => {
                          const s = students.find(st=>st.id===id);
                          return s ? (
                            <span key={id} className="chip chip-red" style={{fontSize:'11px',padding:'4px 8px'}}>
                              {s.name}
                              <button className="chip-remove" onClick={()=>toggleNoisyStudent(id)}>×</button>
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* 우유 학생 현황 */}
                  {students.filter(s=>s.drinks_milk).length > 0 && (
                    <div className="row-stats-section">
                      <h4>🥛 우유 먹는 학생 ({students.filter(s=>s.drinks_milk).length}명)</h4>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'8px'}}>
                        {students.filter(s=>s.drinks_milk).map(s=>(
                          <span key={s.id} className="chip chip-blue" style={{fontSize:'11px',padding:'4px 8px',background:'#e0f2fe',color:'#0369a1'}}>
                            {s.name}
                            <button className="chip-remove" onClick={()=>toggleMilkStudent(s.id)}>×</button>
                          </span>
                        ))}
                      </div>
                      <p style={{fontSize:'11px',color:'#6b7280',margin:0}}>※ 모든 자리배치에 공통 적용됩니다</p>
                    </div>
                  )}

                  {/* 줄별 앉은 횟수 통계 */}
                  {Object.keys(rowStats).length > 0 && (
                    <div className="row-stats-section">
                      <h4>📊 줄별 앉은 횟수 (이전 배치 누적)</h4>
                      <div className="row-stats-wrapper">
                        <table className="row-stats-table">
                          <thead>
                            <tr>
                              <th>학생</th>
                              <th>1줄</th>
                              <th>2줄</th>
                              <th>3줄</th>
                              <th>4줄</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map(s => {
                              const st = rowStats[s.id];
                              if(!st) return null;
                              const vals = [st.row1, st.row2, st.row3, st.row4];
                              const total = vals.reduce((a,b)=>a+b,0);
                              if(total === 0) return null;
                              return (
                                <tr key={s.id}>
                                  <td>{s.student_number}. {s.name}</td>
                                  {vals.map((v,idx) => (
                                    <td key={idx}>{v}</td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── 전체화면 (글씨 크게) ── */}
      {showFullScreen&&selectedArrangement&&(
        <div className="fullscreen-overlay">
          <div className="fullscreen-header">
            <h2>{selectedArrangement.title}</h2>
            <div className="fullscreen-controls">
              <button className={`btn btn-sm ${viewMode==='teacher'?'btn-primary':'btn-outline'}`} onClick={()=>setViewMode('teacher')}>교사 기준</button>
              <button className={`btn btn-sm ${viewMode==='student'?'btn-primary':'btn-outline'}`} onClick={()=>setViewMode('student')}>학생 기준</button>
              <button className="btn-close-fullscreen" onClick={()=>setShowFullScreen(false)}>×</button>
            </div>
          </div>
          <div className={`fullscreen-grid ${viewMode==='student'?'student-view':''}`}>
            <div className="grid-label grid-label-top fullscreen-label">{viewMode==='teacher'?'게시판 (뒤)':'칠판'}</div>
            <div className="grid-container">
              <div className="grid-label grid-label-left fullscreen-label">복도</div>
              <div className="seating-grid fullscreen">
                {grid.map((row,i)=>(
                  <div key={i} className="grid-row">
                    {row.map((cell,j)=>{
                      const dupPair=cell?isDuplicatePairCell(i,j):false;
                      const noisy=cell?isNoisyStudent(cell.id):false;
                      const milkFs=cell?isMilkStudent(cell.id):false;
                      return (
                        <div key={`${i}-${j}`} className={`grid-cell ${cell?'occupied':'empty'} ${dupPair?'duplicate-pair':''} ${noisy?'noisy-student':''} ${milkFs?'milk-student':''}`}>
                          {cell&&(
                            <div style={{position:'relative',width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <div className="student-card-fullscreen">{cell.name}</div>
                              {dupPair&&<span title="이전에 짝이었던 학생과 붙어 있음" style={{position:'absolute',top:'-7px',left:'-7px',width:'22px',height:'22px',borderRadius:'50%',background:'#ef4444',color:'#fff',fontSize:'13px',display:'flex',alignItems:'center',justifyContent:'center',zIndex:6,pointerEvents:'none'}}>⚠</span>}
                              {noisy&&<span style={{position:'absolute',top:'-6px',right:'-6px',fontSize:'16px',zIndex:6,pointerEvents:'none'}}>🔊</span>}
                              {milkFs&&<span style={{position:'absolute',bottom:'-6px',right:'-6px',fontSize:'16px',zIndex:6,pointerEvents:'none'}}>🥛</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="grid-label grid-label-right fullscreen-label">창문</div>
            </div>
            <div className="grid-label grid-label-bottom fullscreen-label">{viewMode==='teacher'?'칠판':'게시판 (뒤)'}</div>
          </div>
        </div>
      )}

      {/* ── 새 배치 모달 ── */}
      {showTitleModal&&(
        <div className="modal-overlay" onClick={()=>setShowTitleModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>새 자리배치</h3><button className="modal-close" onClick={()=>setShowTitleModal(false)}>×</button></div>
            <form onSubmit={handleCreateArrangement} className="modal-form">
              <div className="form-group">
                <label className="label">배치 이름</label>
                <input type="text" className="input" value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                  placeholder="예: 3월 1주차, 모둠배치" autoFocus required/>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={()=>setShowTitleModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">생성</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 앞자리 설정 모달 ── */}
      {showFrontModal&&(
        <div className="modal-overlay" onClick={()=>setShowFrontModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>앞자리 배정</h3><button className="modal-close" onClick={()=>setShowFrontModal(false)}>×</button></div>
            <div className="modal-form">
              <p className="modal-desc">칠판 가까이 앉아야 하는 학생을 선택하세요 (시력, 집중력 등)</p>
              <div className="front-student-chips">
                {frontStudents.map(id=>{ const s=students.find(st=>st.id===id); return s?(
                  <span key={id} className="chip chip-blue">{s.name}
                    <button className="chip-remove" onClick={()=>setFrontStudents(p=>p.filter(i=>i!==id))}>×</button>
                  </span>):null;})}
              </div>
              <div className="student-list" style={{maxHeight:'200px',overflowY:'auto'}}>
                {students.filter(s=>!frontStudents.includes(s.id)).map(s=>(
                  <div key={s.id} className="modal-student-item"
                    onClick={()=>setFrontStudents(p=>[...p,s.id])}>
                    {s.student_number}. {s.name}
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={()=>setShowFrontModal(false)}>닫기</button>
                <button className="btn btn-primary" onClick={()=>{ handleSavePreferences(); setShowFrontModal(false); }}>저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 분리/붙이기 모달 ── */}
      {showSeparateModal&&(
        <div className="modal-overlay" onClick={()=>setShowSeparateModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>분리 설정</h3><button className="modal-close" onClick={()=>setShowSeparateModal(false)}>×</button></div>
            <div className="modal-form">
              <p className="modal-desc">반드시 떨어뜨려야 하는 학생 쌍을 등록하세요</p>
              <div style={{marginBottom:'16px'}}>
                {separateStudents.map((pair,i)=>{
                  const s1=students.find(s=>s.id===pair[0]); const s2=students.find(s=>s.id===pair[1]);
                  return (
                    <span key={i} className="chip chip-red" style={{marginBottom:'6px',display:'inline-flex'}}>
                      {s1?.name} ↔ {s2?.name}
                      <button className="chip-remove" onClick={()=>setSeparateStudents(p=>p.filter((_,j)=>j!==i))}>×</button>
                    </span>
                  );
                })}
              </div>
              <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
                <select className="input" value={separatePair.student1||''} onChange={e=>setSeparatePair(p=>({...p,student1:parseInt(e.target.value)||null}))}>
                  <option value="">학생 1 선택</option>
                  {students.map(s=><option key={s.id} value={s.id}>{s.student_number}. {s.name}</option>)}
                </select>
                <select className="input" value={separatePair.student2||''} onChange={e=>setSeparatePair(p=>({...p,student2:parseInt(e.target.value)||null}))}>
                  <option value="">학생 2 선택</option>
                  {students.map(s=><option key={s.id} value={s.id}>{s.student_number}. {s.name}</option>)}
                </select>
                <button className="btn btn-primary" onClick={()=>{
                  if(separatePair.student1&&separatePair.student2&&separatePair.student1!==separatePair.student2){
                    setSeparateStudents(p=>[...p,[separatePair.student1,separatePair.student2]]);
                    setSeparatePair({student1:null,student2:null});
                  }
                }}>추가</button>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={()=>setShowSeparateModal(false)}>닫기</button>
                <button className="btn btn-primary" onClick={()=>{ handleSavePreferences(); setShowSeparateModal(false); }}>저장</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 자동 배치 모달 ── */}
      {showAutoModal&&(
        <div className="modal-overlay" onClick={()=>setShowAutoModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>자동 배치 설정</h3><button className="modal-close" onClick={()=>setShowAutoModal(false)}>×</button></div>
            <div className="modal-form">
              <div className="form-group">
                <label className="label">배치 방식</label>
                <div style={{display:'flex',gap:'12px',marginBottom:'16px'}}>
                  <button type="button" className={`btn ${autoArrangeMode==='pair'?'btn-primary':'btn-outline'}`} onClick={()=>setAutoArrangeMode('pair')} style={{flex:1}}>짝 배치</button>
                  <button type="button" className={`btn ${autoArrangeMode==='group'?'btn-primary':'btn-outline'}`} onClick={()=>setAutoArrangeMode('group')} style={{flex:1}}>모둠 배치</button>
                </div>
                <label className="label">분단 수</label>
                <input type="number" className="input" value={numColumns}
                  onChange={e=>setNumColumns(Math.max(1,Math.min(5,parseInt(e.target.value)||1)))} min="1" max="5" style={{marginBottom:'12px'}}/>
                {autoArrangeMode==='group'&&(
                  <><label className="label">모둠 인원</label>
                  <input type="number" className="input" value={groupSize}
                    onChange={e=>setGroupSize(Math.max(2,Math.min(6,parseInt(e.target.value)||4)))} min="2" max="6" style={{marginBottom:'12px'}}/></>
                )}
                <div className="auto-arrange-info">
                  <p>✅ 앞자리 학생을 칠판 가까이 우선 배치합니다.</p>
                  <p>✅ 앞/뒤 공정성: 이전 배치 이력 기반으로 배치합니다.</p>
                  <p>✅ 분리 조건과 이전 짝 조합을 피합니다.</p>
                </div>
                <div className="auto-arrange-warning">⚠️ 현재 학생 배치가 초기화됩니다.</div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={()=>setShowAutoModal(false)}>취소</button>
                <button type="button" className="btn btn-primary" onClick={executeAutoArrange}>자동 배치 시작</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SeatingArrangement;
