import React, { useState, useEffect } from 'react';
import { gradeAPI, evaluationsAPI, categoriesAPI, studentsAPI, currentSchoolYear } from '../utils/api';

const SUBJECTS = ['국어', '수학', '바른생활', '슬기로운생활', '즐거운생활', '통합교과', '자율활동', '동아리활동', '진로활동', '행동발달'];

const DEFAULT_BANNED  = '시험, 대회, 수상, 1등, 등수, 성적, 석차';
const DEFAULT_STYLES  = {
  '국어':    '글의 중심 생각을 정확하게 파악하고 자신의 의견을 논리적으로 서술함.',
  '수학':    '계산 원리를 이해하여 정확하게 문제를 해결함.',
  '행동발달':'학급 규칙을 잘 준수하고 친구들을 배려함.',
  '통합교과': '바른 자세로 수업에 참여하며 가족의 소중함을 알고 표현함.',
};

export default function GradeProcess() {
  const year = currentSchoolYear();

  const [students,      setStudents]      = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [selections,    setSelections]    = useState({});   // { 'categoryId_date_title': boolean }
  const [evalMap,       setEvalMap]       = useState({});   // 카테고리별 회차 목록
  const [results,       setResults]       = useState([]);
  const [activeTab,     setActiveTab]     = useState('select'); // 'select' | 'generate' | 'results'
  const [selectedSubject, setSelectedSubject] = useState('국어');
  const [bannedWords,   setBannedWords]   = useState(DEFAULT_BANNED);
  const [exampleStyles, setExampleStyles] = useState(DEFAULT_STYLES);
  const [generating,    setGenerating]    = useState({}); // { studentId: boolean }
  const [loading,       setLoading]       = useState(true);

  useEffect(()=>{ loadAll(); },[]);

  const loadAll = async () => {
    try {
      const [stu, cats, sels, res] = await Promise.all([
        studentsAPI.getAll(year),
        categoriesAPI.getAll(year),
        evaluationsAPI.getGradeSelections(year),
        gradeAPI.getResults(year),
      ]);
      setStudents(Array.isArray(stu)?stu:[]);
      setCategories(Array.isArray(cats)?cats:[]);
      setResults(Array.isArray(res)?res:[]);

      // 선택 상태 복원
      const selMap = {};
      if(Array.isArray(sels)) sels.forEach(s=>{
        if(s.is_selected) selMap[`${s.category_id}_${s.evaluation_date}_${s.title}`]=true;
      });
      setSelections(selMap);

      // 카테고리별 회차 목록 조회
      const em = {};
      for(const cat of (Array.isArray(cats)?cats:[])){
        const evals = await evaluationsAPI.getByCategory(cat.id, year);
        // 날짜+제목 기준으로 유니크한 회차 목록
        const colMap = {};
        if(Array.isArray(evals)) evals.forEach(e=>{
          const date = String(e.evaluation_date).substring(0,10);
          const key  = `${date}_${e.title||''}`;
          if(!colMap[key]) colMap[key]={date, title:e.title||'', key};
        });
        em[cat.id] = Object.values(colMap).sort((a,b)=>b.date.localeCompare(a.date));
      }
      setEvalMap(em);
    } catch(e){ console.error(e); }
    finally { setLoading(false); }
  };

  const toggleSelection = (catId, date, title) => {
    const key = `${catId}_${date}_${title}`;
    setSelections(prev=>({...prev,[key]:!prev[key]}));
  };

  const saveSelections = async () => {
    const toSave = [];
    categories.forEach(cat=>{
      (evalMap[cat.id]||[]).forEach(col=>{
        const key=`${cat.id}_${col.date}_${col.title}`;
        toSave.push({ category_id:cat.id, evaluation_date:col.date, title:col.title, is_selected:!!selections[key] });
      });
    });
    await evaluationsAPI.saveGradeSelections(toSave, year);
    alert('선택 저장 완료!');
  };

  const handleGenerate = async (studentId) => {
    setGenerating(prev=>({...prev,[studentId]:true}));
    try {
      const style = exampleStyles[selectedSubject] || '';
      await gradeAPI.generate({ student_id:studentId, subject:selectedSubject, example_style:style, banned_words:bannedWords, year });
      const res = await gradeAPI.getResults(year);
      setResults(Array.isArray(res)?res:[]);
    } catch(e){ alert(e.message||'생성 실패'); }
    finally { setGenerating(prev=>({...prev,[studentId]:false})); }
  };

  const handleGenerateAll = async () => {
    for(const s of students){ await handleGenerate(s.id); }
  };

  const handleUpdateResult = async (id, text) => {
    await gradeAPI.updateResult(id, text);
    const res = await gradeAPI.getResults(year);
    setResults(Array.isArray(res)?res:[]);
  };

  const getResult = (studentId, subject) =>
    results.find(r=>r.student_id===studentId&&r.subject===subject);

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'400px',flexDirection:'column',gap:'16px'}}>
      <div className="spinner"/><p>로딩 중...</p>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',gap:'16px'}}>
      {/* 헤더 */}
      <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'16px 24px',borderLeft:'5px solid var(--primary)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <h2 style={{margin:0,fontSize:'20px',fontWeight:700,color:'var(--primary-dark)'}}>성적처리</h2>
          <p style={{margin:'4px 0 0',fontSize:'13px',color:'var(--text-secondary)'}}>평가 회차를 선택하고 Ollama 70B로 평어를 생성합니다</p>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {['select','generate','results'].map(tab=>(
            <button key={tab} className={`btn btn-sm ${activeTab===tab?'btn-primary':'btn-outline'}`} onClick={()=>setActiveTab(tab)}>
              {tab==='select'?'① 평가 선택':tab==='generate'?'② 평어 생성':'③ 결과 보기'}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:'hidden'}}>

        {/* ── 탭 1: 평가 회차 선택 ── */}
        {activeTab==='select'&&(
          <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'24px',height:'100%',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <p style={{margin:0,fontSize:'14px',color:'var(--text-secondary)'}}>성적처리에 사용할 평가 회차를 선택하세요.</p>
              <button className="btn btn-primary" onClick={saveSelections}>선택 저장</button>
            </div>
            {categories.length===0 ? (
              <p style={{color:'var(--text-secondary)',textAlign:'center',padding:'40px'}}>평가 카테고리가 없습니다.</p>
            ) : categories.map(cat=>(
              <div key={cat.id} style={{marginBottom:'20px',border:'1px solid var(--border-light)',borderRadius:'10px',overflow:'hidden'}}>
                <div style={{padding:'10px 16px',background:'var(--primary-bg)',borderBottom:'1px solid var(--border-light)',fontWeight:700,fontSize:'14px',color:'var(--primary-dark)'}}>
                  {cat.name} (만점: {cat.max_score}점)
                </div>
                <div style={{padding:'12px 16px',display:'flex',flexWrap:'wrap',gap:'8px'}}>
                  {(evalMap[cat.id]||[]).length===0
                    ? <span style={{fontSize:'13px',color:'var(--text-tertiary)'}}>평가 기록 없음</span>
                    : (evalMap[cat.id]||[]).map(col=>{
                        const key=`${cat.id}_${col.date}_${col.title}`;
                        const sel=!!selections[key];
                        return (
                          <button key={col.key} onClick={()=>toggleSelection(cat.id,col.date,col.title)}
                            style={{
                              padding:'6px 14px',borderRadius:'20px',border:`2px solid ${sel?'var(--primary)':'var(--border-light)'}`,
                              background:sel?'var(--primary)':'white',color:sel?'white':'var(--text-primary)',
                              cursor:'pointer',fontSize:'13px',fontFamily:'inherit',transition:'var(--transition)',
                            }}>
                            {col.title||'제목없음'} ({col.date.substring(5)})
                          </button>
                        );
                      })
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 탭 2: 평어 생성 ── */}
        {activeTab==='generate'&&(
          <div style={{display:'flex',flexDirection:'column',gap:'16px',height:'100%',overflowY:'auto'}}>
            {/* 설정 */}
            <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'20px 24px'}}>
              <div style={{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'flex-end'}}>
                <div>
                  <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>과목</label>
                  <select className="input" value={selectedSubject} onChange={e=>setSelectedSubject(e.target.value)}>
                    {SUBJECTS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{flex:1,minWidth:'200px'}}>
                  <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>금지어</label>
                  <input className="input" value={bannedWords} onChange={e=>setBannedWords(e.target.value)} style={{width:'100%'}}/>
                </div>
                <button className="btn btn-primary" onClick={handleGenerateAll}>전체 생성</button>
              </div>
              <div style={{marginTop:'12px'}}>
                <label style={{fontSize:'12px',color:'var(--text-secondary)',display:'block',marginBottom:'4px'}}>문체 예시 ({selectedSubject})</label>
                <textarea className="input" rows={2} style={{width:'100%',resize:'vertical'}}
                  value={exampleStyles[selectedSubject]||''}
                  onChange={e=>setExampleStyles(prev=>({...prev,[selectedSubject]:e.target.value}))}
                  placeholder="원하는 문체 예시를 입력하세요"/>
              </div>
            </div>

            {/* 학생별 생성 */}
            <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                <thead style={{background:'var(--primary)',color:'white'}}>
                  <tr>
                    <th style={{padding:'12px 16px',textAlign:'left',width:'120px'}}>학생</th>
                    <th style={{padding:'12px 16px',textAlign:'left'}}>생성된 평어</th>
                    <th style={{padding:'12px 16px',width:'100px'}}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s=>{
                    const result=getResult(s.id,selectedSubject);
                    const isGen=generating[s.id];
                    return (
                      <tr key={s.id} style={{borderBottom:'1px solid var(--border-light)'}}>
                        <td style={{padding:'12px 16px',fontWeight:600}}>{s.student_number}. {s.name}</td>
                        <td style={{padding:'12px 16px'}}>
                          {result ? (
                            <textarea style={{width:'100%',border:'1px solid var(--border-light)',borderRadius:'6px',padding:'6px 8px',fontSize:'13px',resize:'vertical',fontFamily:'inherit',lineHeight:1.6}}
                              rows={3} value={result.generated_text}
                              onChange={e=>handleUpdateResult(result.id,e.target.value)}/>
                          ) : (
                            <span style={{color:'var(--text-tertiary)',fontSize:'13px'}}>아직 생성되지 않았습니다.</span>
                          )}
                        </td>
                        <td style={{padding:'12px 16px',textAlign:'center'}}>
                          <button className="btn btn-primary btn-sm" onClick={()=>handleGenerate(s.id)} disabled={isGen}>
                            {isGen?'생성 중...':'생성'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 탭 3: 결과 보기 ── */}
        {activeTab==='results'&&(
          <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'24px',height:'100%',overflowY:'auto'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'20px',flexWrap:'wrap'}}>
              {SUBJECTS.map(s=>(
                <button key={s} className={`btn btn-sm ${selectedSubject===s?'btn-primary':'btn-outline'}`} onClick={()=>setSelectedSubject(s)}>{s}</button>
              ))}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
              <thead style={{background:'var(--bg-secondary)'}}>
                <tr>
                  <th style={{padding:'10px 16px',textAlign:'left',borderBottom:'2px solid var(--border-light)',width:'120px'}}>학생</th>
                  <th style={{padding:'10px 16px',textAlign:'left',borderBottom:'2px solid var(--border-light)'}}>평어 ({selectedSubject})</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s=>{
                  const result=getResult(s.id,selectedSubject);
                  return (
                    <tr key={s.id} style={{borderBottom:'1px solid var(--border-light)'}}>
                      <td style={{padding:'12px 16px',fontWeight:600,verticalAlign:'top'}}>{s.student_number}. {s.name}</td>
                      <td style={{padding:'12px 16px',fontSize:'13px',lineHeight:1.7,color:result?'var(--text-primary)':'var(--text-tertiary)'}}>
                        {result?.generated_text||'미생성'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
