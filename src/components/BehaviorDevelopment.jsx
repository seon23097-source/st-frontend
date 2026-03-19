import React, { useState, useEffect, useRef } from 'react';
import { behaviorAPI, studentsAPI, currentSchoolYear } from '../utils/api';

const OPT5  = ['', '매우부족', '부족', '보통', '양호', '매우우수'];
const OPT3  = ['', '노력요함', '보통', '우수'];
const OPT_ART = ['선택안함', '체육', '음악', '미술', '체육/예술'];

export default function BehaviorDevelopment() {
  const [students,         setStudents]         = useState([]);
  const [selectedStudent,  setSelectedStudent]  = useState(null);
  const [logs,             setLogs]             = useState([]);
  const [allLogs,          setAllLogs]          = useState([]);
  const [checklist,        setChecklist]        = useState(null);
  const [logDate,          setLogDate]          = useState(()=>new Date().toISOString().split('T')[0]);
  const [logContent,       setLogContent]       = useState('');
  const [editingLog,       setEditingLog]       = useState(null);
  const [editContent,      setEditContent]      = useState('');
  const [showChecklist,    setShowChecklist]    = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [loading,          setLoading]          = useState(true);
  const logEndRef = useRef(null);
  const year = currentSchoolYear();

  useEffect(()=>{ loadInit(); },[]);
  useEffect(()=>{ if(selectedStudent) loadStudentData(selectedStudent.id); },[selectedStudent]);

  const loadInit = async () => {
    try {
      const [stu, logs] = await Promise.all([studentsAPI.getAll(), behaviorAPI.getLogs(year)]);
      setStudents(Array.isArray(stu)?stu:[]);
      setAllLogs(Array.isArray(logs)?logs:[]);
    } catch(e){ console.error(e); }
    finally { setLoading(false); }
  };

  const loadStudentData = async (studentId) => {
    try {
      const [studentLogs, cl] = await Promise.all([
        behaviorAPI.getLogs(year, studentId),
        behaviorAPI.getChecklist(studentId, year),
      ]);
      setLogs(Array.isArray(studentLogs)?studentLogs:[]);
      setChecklist(cl);
    } catch(e){ console.error(e); }
  };

  const [relatedStudents, setRelatedStudents] = useState([]); // 선택된 관련 학생 ids

  const handleAddLog = async (e) => {
    e.preventDefault();
    if(!logContent.trim()||!selectedStudent) return;
    try {
      await behaviorAPI.createLog({
        student_id: selectedStudent.id,
        log_date: logDate,
        content: logContent.trim(),
        related_student_ids: relatedStudents,
      }, year);
      setLogContent('');
      setRelatedStudents([]);
      await loadStudentData(selectedStudent.id);
      const all = await behaviorAPI.getLogs(year);
      setAllLogs(Array.isArray(all)?all:[]);
      setTimeout(()=>logEndRef.current?.scrollIntoView({behavior:'smooth'}),100);
    } catch(e){ alert(e.message||'저장 실패'); }
  };

  const handleDeleteLog = async (id) => {
    if(!confirm('이 기록을 삭제하시겠습니까?')) return;
    await behaviorAPI.deleteLog(id);
    await loadStudentData(selectedStudent.id);
    const all = await behaviorAPI.getLogs(year);
    setAllLogs(Array.isArray(all)?all:[]);
  };

  const handleUpdateLog = async (id) => {
    if(!editContent.trim()) return;
    await behaviorAPI.updateLog(id, editContent.trim());
    setEditingLog(null);
    await loadStudentData(selectedStudent.id);
  };

  const handleSaveChecklist = async () => {
    if(!selectedStudent||!checklist) return;
    setSaving(true);
    try {
      await behaviorAPI.saveChecklist(selectedStudent.id, checklist, year);
      alert('체크리스트 저장 완료!');
    } catch(e){ alert(e.message||'저장 실패'); }
    finally { setSaving(false); }
  };

  const updateCL = (key, val) => setChecklist(prev=>({...prev,[key]:val}));

  // 학생별 최근 기록 미리보기
  const getRecentLog = (studentId) => {
    const sl = allLogs.filter(l=>l.student_id===studentId);
    if(sl.length===0) return null;
    return sl[0];
  };

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'400px',flexDirection:'column',gap:'16px'}}>
      <div className="spinner"/><p>로딩 중...</p>
    </div>
  );

  return (
    <div style={{display:'flex',height:'100%',gap:'24px'}}>

      {/* ── 왼쪽: 학생 목록 ── */}
      <aside style={{width:'220px',minWidth:'220px',background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border-light)',fontWeight:700,fontSize:'16px'}}>
          학생 목록
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'8px'}}>
          {students.map(s=>{
            const recent = getRecentLog(s.id);
            return (
              <div key={s.id}
                onClick={()=>setSelectedStudent(s)}
                style={{
                  padding:'10px 12px', borderRadius:'8px', cursor:'pointer', marginBottom:'4px',
                  background: selectedStudent?.id===s.id ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: selectedStudent?.id===s.id ? 'white' : 'var(--text-primary)',
                  transition:'var(--transition)',
                }}>
                <div style={{fontWeight:600,fontSize:'14px'}}>{s.student_number}. {s.name}</div>
                {recent&&<div style={{fontSize:'11px',opacity:.7,marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{recent.log_date} {recent.content}</div>}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── 오른쪽: 메인 ── */}
      <main style={{flex:1,display:'flex',flexDirection:'column',gap:'16px',overflow:'hidden'}}>
        {!selectedStudent ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'12px',color:'var(--text-secondary)'}}>
            <div style={{fontSize:'48px'}}>🌱</div>
            <div style={{fontSize:'20px',fontWeight:700,color:'var(--text-primary)'}}>행동발달</div>
            <div style={{fontSize:'14px'}}>왼쪽에서 학생을 선택하세요.</div>
          </div>
        ) : (
          <>
            {/* 상단: 학생 이름 + 탭 */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'16px 24px',borderLeft:'5px solid var(--primary)'}}>
              <h2 style={{margin:0,fontSize:'20px',fontWeight:700,color:'var(--primary-dark)'}}>
                {selectedStudent.student_number}번 {selectedStudent.name}
              </h2>
              <div style={{display:'flex',gap:'8px'}}>
                <button className={`btn btn-sm ${!showChecklist?'btn-primary':'btn-outline'}`} onClick={()=>setShowChecklist(false)}>관찰 기록</button>
                <button className={`btn btn-sm ${showChecklist?'btn-primary':'btn-outline'}`} onClick={()=>setShowChecklist(true)}>행동발달 체크리스트</button>
              </div>
            </div>

            {!showChecklist ? (
              /* ── 관찰 기록 탭 ── */
              <div style={{display:'flex',flexDirection:'column',flex:1,gap:'12px',overflow:'hidden'}}>
                {/* 기록 입력 */}
                <form onSubmit={handleAddLog} style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'16px 20px'}}>
                  <div style={{display:'flex',gap:'12px',marginBottom:'10px'}}>
                    <div>
                      <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>날짜</label>
                      <input type="date" className="input" value={logDate} onChange={e=>setLogDate(e.target.value)} style={{width:'140px'}}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>내용</label>
                      <input type="text" className="input" value={logContent} onChange={e=>setLogContent(e.target.value)}
                        placeholder="관찰 내용을 입력하세요..." style={{width:'100%'}}/>
                    </div>
                    <div style={{display:'flex',alignItems:'flex-end'}}>
                      <button type="submit" className="btn btn-primary" disabled={!logContent.trim()}>기록 추가</button>
                    </div>
                  </div>
                  {/* 관련 학생 선택 */}
                  <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                    <span style={{fontSize:'12px',color:'var(--text-secondary)',whiteSpace:'nowrap'}}>관련 학생:</span>
                    {relatedStudents.map(id=>{
                      const s=students.find(st=>st.id===id);
                      return s?(
                        <span key={id} style={{background:'var(--primary-bg)',border:'1px solid var(--primary-light)',borderRadius:'16px',padding:'2px 8px',fontSize:'12px',color:'var(--primary-dark)',display:'inline-flex',alignItems:'center',gap:'4px'}}>
                          {s.student_number}번 {s.name}
                          <button type="button" onClick={()=>setRelatedStudents(p=>p.filter(i=>i!==id))}
                            style={{background:'none',border:'none',cursor:'pointer',color:'var(--danger)',fontSize:'14px',lineHeight:1,padding:0}}>×</button>
                        </span>
                      ):null;
                    })}
                    <select className="input" style={{width:'120px',fontSize:'12px',padding:'3px 6px'}}
                      value="" onChange={e=>{
                        const id=parseInt(e.target.value);
                        if(id&&id!==selectedStudent.id&&!relatedStudents.includes(id))
                          setRelatedStudents(p=>[...p,id]);
                      }}>
                      <option value="">+ 학생 추가</option>
                      {students.filter(s=>s.id!==selectedStudent.id&&!relatedStudents.includes(s.id)).map(s=>(
                        <option key={s.id} value={s.id}>{s.student_number}번 {s.name}</option>
                      ))}
                    </select>
                  </div>
                </form>

                {/* 기록 목록 */}
                <div style={{flex:1,overflowY:'auto',background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'8px'}}>
                  {logs.length===0 ? (
                    <div style={{textAlign:'center',padding:'40px',color:'var(--text-secondary)'}}>관찰 기록이 없습니다.</div>
                  ) : (
                    logs.map(log=>(
                      <div key={log.id} style={{padding:'12px 16px',borderBottom:'1px solid var(--border-light)',display:'flex',gap:'12px',alignItems:'flex-start'}}>
                        <div style={{fontSize:'12px',color:'var(--text-secondary)',whiteSpace:'nowrap',marginTop:'2px',minWidth:'80px'}}>{String(log.log_date).substring(0,10)}</div>
                        <div style={{flex:1}}>
                          {editingLog===log.id ? (
                            <div style={{display:'flex',gap:'8px'}}>
                              <input className="input" value={editContent} onChange={e=>setEditContent(e.target.value)}
                                onKeyDown={e=>{ if(e.key==='Enter') handleUpdateLog(log.id); if(e.key==='Escape') setEditingLog(null); }}
                                autoFocus style={{flex:1}}/>
                              <button className="btn btn-primary btn-xs" onClick={()=>handleUpdateLog(log.id)}>저장</button>
                              <button className="btn btn-outline btn-xs" onClick={()=>setEditingLog(null)}>취소</button>
                            </div>
                          ) : (
                            <div>
                              <span style={{fontSize:'14px',color:'var(--text-primary)'}}>{log.content}</span>
                              {log.related_student_ids?.length>0&&(
                                <div style={{marginTop:'4px',display:'flex',gap:'4px',flexWrap:'wrap'}}>
                                  {log.related_student_ids.map(id=>{
                                    const s=students.find(st=>st.id===id);
                                    return s?(
                                      <span key={id} style={{fontSize:'11px',background:'var(--primary-bg)',border:'1px solid var(--primary-light)',borderRadius:'10px',padding:'1px 6px',color:'var(--primary-dark)'}}>
                                        관련: {s.name}
                                      </span>
                                    ):null;
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div style={{display:'flex',gap:'6px'}}>
                          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:'var(--primary)'}}
                            onClick={()=>{ setEditingLog(log.id); setEditContent(log.content); }}>수정</button>
                          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:'12px',color:'var(--danger)'}}
                            onClick={()=>handleDeleteLog(log.id)}>삭제</button>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef}/>
                </div>
              </div>
            ) : (
              /* ── K1~K6 체크리스트 탭 ── */
              checklist&&(
                <div style={{flex:1,overflowY:'auto',background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'24px'}}>
                  {/* K1 학습 */}
                  <BehaviorSection title="K1. 학습" color="#3b82f6">
                    <BehaviorSelect label="성취도" value={checklist.k1_achievement} opts={OPT5} onChange={v=>updateCL('k1_achievement',v)}/>
                    <BehaviorSelect label="수업태도" value={checklist.k1_attitude} opts={OPT5} onChange={v=>updateCL('k1_attitude',v)}/>
                    <BehaviorSelect label="참여도" value={checklist.k1_participation} opts={OPT5} onChange={v=>updateCL('k1_participation',v)}/>
                  </BehaviorSection>
                  {/* K2 사회성 */}
                  <BehaviorSection title="K2. 사회성" color="#8b5cf6">
                    <BehaviorSelect label="교우관계" value={checklist.k2_relationship} opts={OPT5} onChange={v=>updateCL('k2_relationship',v)}/>
                    <BehaviorSelect label="감정조절" value={checklist.k2_emotion} opts={OPT3} onChange={v=>updateCL('k2_emotion',v)}/>
                    <BehaviorSelect label="갈등해결" value={checklist.k2_conflict} opts={OPT3} onChange={v=>updateCL('k2_conflict',v)}/>
                  </BehaviorSection>
                  {/* K3 예체능 */}
                  <BehaviorSection title="K3. 예체능" color="#10b981">
                    <BehaviorSelect label="예체능" value={OPT_ART.indexOf(checklist.k3_arts)<0?0:OPT_ART.indexOf(checklist.k3_arts)}
                      opts={OPT_ART} onChange={v=>updateCL('k3_arts',OPT_ART[v])} isArt/>
                  </BehaviorSection>
                  {/* K4 인성 */}
                  <BehaviorSection title="K4. 인성" color="#f59e0b">
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                      <div>
                        <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>인성 1</label>
                        <input className="input" value={checklist.k4_character1} onChange={e=>updateCL('k4_character1',e.target.value)} placeholder="예: 솔직하고 정직함"/>
                      </div>
                      <div>
                        <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>인성 2</label>
                        <input className="input" value={checklist.k4_character2} onChange={e=>updateCL('k4_character2',e.target.value)} placeholder="예: 배려심이 깊음"/>
                      </div>
                    </div>
                  </BehaviorSection>
                  {/* K5 생활습관 */}
                  <BehaviorSection title="K5. 생활습관" color="#ef4444">
                    <BehaviorSelect label="정리정돈" value={checklist.k5_organization} opts={OPT3} onChange={v=>updateCL('k5_organization',v)}/>
                    <BehaviorSelect label="창의성" value={checklist.k5_creativity} opts={OPT3} onChange={v=>updateCL('k5_creativity',v)}/>
                  </BehaviorSection>
                  {/* K6 기타 */}
                  <BehaviorSection title="K6. 기타" color="#6b7280">
                    <textarea className="input" value={checklist.k6_etc} onChange={e=>updateCL('k6_etc',e.target.value)}
                      placeholder="기타 특기사항을 자유롭게 입력하세요" rows={3} style={{width:'100%',resize:'vertical'}}/>
                  </BehaviorSection>

                  <div style={{display:'flex',justifyContent:'flex-end',marginTop:'20px'}}>
                    <button className="btn btn-primary" onClick={handleSaveChecklist} disabled={saving}>
                      {saving?'저장 중...':'체크리스트 저장'}
                    </button>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}

function BehaviorSection({ title, color, children }) {
  return (
    <div style={{marginBottom:'20px',border:'1px solid var(--border-light)',borderRadius:'10px',overflow:'hidden'}}>
      <div style={{padding:'10px 16px',background:color+'18',borderBottom:'1px solid '+color+'33',fontWeight:700,fontSize:'14px',color:color}}>
        {title}
      </div>
      <div style={{padding:'16px',display:'flex',flexWrap:'wrap',gap:'12px'}}>
        {children}
      </div>
    </div>
  );
}

function BehaviorSelect({ label, value, opts, onChange, isArt=false }) {
  return (
    <div>
      <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>{label}</label>
      <select className="input" value={value} onChange={e=>onChange(parseInt(e.target.value))} style={{minWidth:'120px'}}>
        {opts.map((o,i)=><option key={i} value={i}>{o||'선택'}</option>)}
      </select>
    </div>
  );
}
