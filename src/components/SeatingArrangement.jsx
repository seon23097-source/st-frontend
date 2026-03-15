import React, { useState, useEffect, useCallback, useRef } from 'react';
import { seatingAPI, studentsAPI, currentSchoolYear } from '../utils/api';
import './SeatingArrangement.css';

function SeatingArrangement() {
  const [arrangements,        setArrangements]        = useState([]);
  const [selectedArrangement, setSelectedArrangement] = useState(null);
  const [students,            setStudents]            = useState([]);
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
  const checkHistory = async (row,col) => {
    const group=findGroupForCell(row,col);
    if(group.length<2){ setHistoryPopup(null); return; }
    const cur=grid[row][col];
    const partnerIds=group.filter(g=>g.student.id!==cur.id).map(g=>g.student.id);
    try {
      const history=await seatingAPI.getHistory(cur.id);
      const matching=history.filter(h=>(h.partner_ids||[]).some(pid=>partnerIds.includes(pid)));
      if(matching.length>0) setHistoryPopup({row,col,partners:group.filter(g=>g.student.id!==cur.id).map(g=>g.student.name),history:matching});
      else setHistoryPopup(null);
    } catch(e){ console.error('이력 조회 실패:',e); }
  };

  const loadArrangementDetails = async (id) => {
    try {
      const data=await seatingAPI.getArrangementDetails(id);
      setSelectedArrangement(data.arrangement);
      const newGrid=Array(10).fill(null).map(()=>Array(10).fill(null));
      data.positions.forEach(p=>{ newGrid[p.row_pos][p.col_pos]={id:p.student_id,name:p.name,student_number:p.student_number}; });
      setGrid(newGrid);
      const assignedIds=data.positions.map(p=>p.student_id);
      setUnassignedStudents(students.filter(s=>!assignedIds.includes(s.id)));
      setFrontStudents(data.preferences.front_students||[]);
      setSeparateStudents(data.preferences.separate_students||[]);
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
      showToast('저장되었습니다! ✓','success');
    } catch(e){ showToast('저장 실패: '+e.message,'error'); }
  };

  // ── 드래그앤드롭 ──
  const handleDragStart = (e,student,fromGrid=false,row=null,col=null) => {
    setDraggedStudent({student,fromGrid,row,col});
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

  // ── 행 공정성 자동배치 ──
  const calculateRowFairness = async (studentList) => {
    const rowScores={};
    for(const arr of arrangements){
      if(arr.id===selectedArrangement?.id) continue;
      try {
        const detail=await seatingAPI.getArrangementDetails(arr.id);
        detail.positions.forEach(p=>{ if(!rowScores[p.student_id]) rowScores[p.student_id]=[]; rowScores[p.student_id].push(p.row_pos); });
      } catch{}
    }
    const scored=studentList.map(student=>{
      const rows=rowScores[student.id];
      if(!rows||rows.length===0) return {student,avgRow:5+Math.random()*0.5};
      const avg=rows.reduce((a,b)=>a+b,0)/rows.length;
      return {student,avgRow:avg+Math.random()*0.3};
    });
    scored.sort((a,b)=>b.avgRow-a.avgRow);
    return scored.map(s=>s.student);
  };

  const executeAutoArrange = async () => {
    setShowAutoModal(false);
    try {
      const allStudents=[...students];
      const frontList=allStudents.filter(s=>frontStudents.includes(s.id));
      const regulars=allStudents.filter(s=>!frontStudents.includes(s.id));
      const newGrid=Array(10).fill(null).map(()=>Array(10).fill(null));
      const fairOrderedRegulars=await calculateRowFairness(regulars);
      const allToArrange=[...fairOrderedRegulars];
      const histories=await Promise.all(allToArrange.map(s=>seatingAPI.getHistory(s.id).catch(()=>[])));
      const pairHistory={};
      allToArrange.forEach((s,i)=>{ const p=new Set(); histories[i].forEach(h=>(h.partner_ids||[]).forEach(pid=>p.add(pid))); pairHistory[s.id]=p; });
      const shouldSeparate=(id1,id2)=>separateStudents.some(pair=>(pair[0]===id1&&pair[1]===id2)||(pair[0]===id2&&pair[1]===id1));
      const isCellEmpty=(r,c)=>r>=0&&r<10&&c>=0&&c<10&&!newGrid[r][c];
      let si=0;

      if(autoArrangeMode==='pair'){
        const cw=3,tw=numColumns*cw-1,sc=Math.floor((10-tw)/2);
        const columns=[];
        for(let i=0;i<numColumns;i++){ const c1=sc+i*cw,c2=c1+1; if(c2<10) columns.push([c1,c2]); }
        const rows=[]; for(let r=9;r>=0;r-=2) rows.push(r);
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
                let s2=null;
                for(let i=si;i<allToArrange.length;i++){
                  const c=allToArrange[i];
                  if(!shouldSeparate(s1.id,c.id)&&!pairHistory[s1.id]?.has(c.id)){ s2=c; allToArrange.splice(i,1); break; }
                }
                if(!s2) for(let i=si;i<allToArrange.length;i++){
                  const c=allToArrange[i]; if(!shouldSeparate(s1.id,c.id)){ s2=c; allToArrange.splice(i,1); break; }
                }
                if(!s2&&si<allToArrange.length) s2=allToArrange[si++];
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
        const bg=gr+1; const blockRows=[]; let sr=9;
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
      showToast('자동 배치 완료! 저장 버튼을 눌러주세요.','success');
    } catch(e){ showToast('자동 배치 중 오류: '+e.message,'error'); }
  };

  const handleSavePreferences = async () => {
    if(!selectedArrangement) return;
    try {
      await seatingAPI.savePreferences(selectedArrangement.id,{front_students:frontStudents,separate_students:separateStudents});
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
                <button className="btn btn-outline btn-sm" onClick={()=>setShowAiPanel(p=>!p)}
                  style={showAiPanel?{background:'var(--primary)',color:'white'}:{}}>
                  🤖 AI 배치
                </button>
                <button className="btn btn-outline btn-sm" onClick={()=>setShowFullScreen(true)}>전체화면</button>
                <button className="btn btn-primary btn-sm" onClick={handleSavePositions}>저장</button>
              </div>
            </div>

            <div className="seating-workspace">
              {/* 그리드 */}
              <div className="seating-grid-wrapper">
                <div className="grid-label grid-label-top">게시판 (뒤)</div>
                <div className="grid-container">
                  <div className="grid-label grid-label-left">복도</div>
                  <div className="seating-grid">
                    {grid.map((row,i)=>(
                      <div key={i} className="grid-row">
                        {row.map((cell,j)=>{
                          const cellType=cell?getCellType(i,j):null;
                          return (
                            <div key={`${i}-${j}`}
                              className={`grid-cell ${cell?'occupied':''} ${cellType==='pair'?'has-pair':''} ${cellType==='group'?'has-group':''}`}
                              onDragOver={handleDragOver}
                              onDrop={e=>handleDrop(e,i,j)}
                              onClick={()=>cell&&checkHistory(i,j)}>
                              {cell&&(
                                <div className="student-card-wrapper">
                                  <div className="student-card"
                                    draggable onDragStart={e=>handleDragStart(e,cell,true,i,j)}>
                                    {cell.student_number}
                                  </div>
                                  <button className="btn-remove-cell" onClick={e=>{e.stopPropagation();handleRemoveFromGrid(i,j);}}>×</button>
                                </div>
                              )}
                              {historyPopup?.row===i&&historyPopup?.col===j&&(
                                <div className="history-popup" onClick={e=>e.stopPropagation()}>
                                  <div className="history-popup-title">이전 동석 기록</div>
                                  {historyPopup.history.map((h,idx)=>(
                                    <div key={idx} className="history-popup-item">
                                      <span className="history-popup-warning">⚠️ {historyPopup.partners.join(', ')}와 이전에 함께 앉음</span>
                                    </div>
                                  ))}
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
                        <div key={s.id} className="student-card draggable"
                          draggable onDragStart={e=>handleDragStart(e,s)}>
                          {s.student_number}. {s.name}
                        </div>
                      ))
                    }
                  </div>
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
                    {row.map((cell,j)=>(
                      <div key={`${i}-${j}`} className={`grid-cell ${cell?'occupied':'empty'}`}>
                        {cell&&<div className="student-card-fullscreen">{cell.name}</div>}
                      </div>
                    ))}
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
                  <div key={s.id} className="student-card draggable" style={{cursor:'pointer'}}
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
