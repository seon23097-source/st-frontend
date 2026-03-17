import React, { useState, useEffect, useRef } from 'react';
import { albumAPI } from '../utils/api';

const BACKEND = 'https://st.looool.xyz';

export default function Album() {
  const [photos,       setPhotos]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [selectedPhoto,setSelectedPhoto]= useState(null);
  const [error,        setError]        = useState('');
  const fileInputRef = useRef(null);

  useEffect(()=>{ loadPhotos(); },[]);

  const loadPhotos = async () => {
    setLoading(true); setError('');
    try {
      const data = await albumAPI.list();
      setPhotos(Array.isArray(data)?data:[]);
    } catch(e){
      setError('앨범을 불러오지 못했습니다: '+e.message);
    } finally { setLoading(false); }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if(!files.length) return;
    setUploading(true);
    try {
      for(const file of files){
        await albumAPI.upload(file);
      }
      await loadPhotos();
    } catch(e){ alert('업로드 실패: '+e.message); }
    finally { setUploading(false); if(fileInputRef.current) fileInputRef.current.value=''; }
  };

  const handleDelete = async (filename) => {
    if(!confirm(`"${filename}" 사진을 삭제하시겠습니까?`)) return;
    try {
      await albumAPI.delete(filename);
      setSelectedPhoto(null);
      await loadPhotos();
    } catch(e){ alert('삭제 실패: '+e.message); }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',gap:'16px'}}>
      {/* 헤더 */}
      <div style={{background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'16px 24px',borderLeft:'5px solid var(--primary)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <h2 style={{margin:0,fontSize:'20px',fontWeight:700,color:'var(--primary-dark)'}}>앨범</h2>
          <p style={{margin:'4px 0 0',fontSize:'13px',color:'var(--text-secondary)'}}>Nextcloud 저장 · {photos.length}장</p>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button className="btn btn-primary" onClick={()=>fileInputRef.current?.click()} disabled={uploading}>
            {uploading?'업로드 중...':'+ 사진 추가'}
          </button>
          <button className="btn btn-outline" onClick={loadPhotos}>새로고침</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleUpload}/>
      </div>

      {/* 본문 */}
      <div style={{flex:1,overflow:'hidden',background:'white',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-md)',padding:'20px'}}>
        {loading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'16px'}}>
            <div className="spinner"/><p style={{color:'var(--text-secondary)'}}>불러오는 중...</p>
          </div>
        ) : error ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'12px',color:'var(--danger)'}}>
            <div style={{fontSize:'40px'}}>⚠️</div>
            <p style={{textAlign:'center',maxWidth:'320px'}}>{error}</p>
            <p style={{fontSize:'13px',color:'var(--text-secondary)'}}>Nextcloud 설정을 확인해주세요 (.env의 NEXTCLOUD_* 값)</p>
            <button className="btn btn-outline" onClick={loadPhotos}>다시 시도</button>
          </div>
        ) : photos.length===0 ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:'12px',color:'var(--text-secondary)'}}>
            <div style={{fontSize:'48px'}}>📸</div>
            <p style={{fontSize:'16px',fontWeight:600}}>사진이 없습니다</p>
            <p style={{fontSize:'14px'}}>+ 사진 추가 버튼으로 사진을 올려보세요</p>
          </div>
        ) : (
          <div style={{height:'100%',overflowY:'auto'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'12px'}}>
              {photos.map(photo=>(
                <div key={photo.filename}
                  onClick={()=>setSelectedPhoto(photo)}
                  style={{
                    borderRadius:'10px',overflow:'hidden',cursor:'pointer',
                    boxShadow:'var(--shadow-sm)',transition:'var(--transition)',
                    border:'2px solid transparent',
                    ...(selectedPhoto?.filename===photo.filename?{border:'2px solid var(--primary)'}:{}),
                  }}
                  onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                  <div style={{aspectRatio:'4/3',overflow:'hidden',background:'var(--bg-secondary)'}}>
                    <img src={BACKEND + photo.url} alt={photo.filename}
                      style={{width:'100%',height:'100%',objectFit:'cover'}}
                      loading="lazy"
                      onError={e=>{ e.target.src=''; e.target.style.display='none'; }}/>
                  </div>
                  <div style={{padding:'8px 10px',background:'white'}}>
                    <div style={{fontSize:'11px',color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{photo.filename}</div>
                    <div style={{fontSize:'11px',color:'var(--text-tertiary)',marginTop:'2px'}}>
                      {photo.lastModified ? new Date(photo.lastModified).toLocaleDateString('ko-KR') : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 사진 상세 모달 */}
      {selectedPhoto&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}
          onClick={()=>setSelectedPhoto(null)}>
          <div style={{background:'white',borderRadius:'16px',overflow:'hidden',maxWidth:'90vw',maxHeight:'90vh',display:'flex',flexDirection:'column'}}
            onClick={e=>e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div style={{padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border-light)'}}>
              <span style={{fontSize:'14px',fontWeight:600,color:'var(--text-primary)',maxWidth:'400px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selectedPhoto.filename}</span>
              <div style={{display:'flex',gap:'8px'}}>
                <a href={BACKEND + selectedPhoto.url} download={selectedPhoto.filename} target="_blank" rel="noreferrer"
                  className="btn btn-outline btn-sm">다운로드</a>
                <button className="btn btn-sm" style={{background:'var(--danger)',color:'white',border:'none'}}
                  onClick={()=>handleDelete(selectedPhoto.filename)}>삭제</button>
                <button className="btn btn-outline btn-sm" onClick={()=>setSelectedPhoto(null)}>닫기</button>
              </div>
            </div>
            {/* 사진 */}
            <div style={{flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-secondary)',padding:'16px'}}>
              <img src={BACKEND + selectedPhoto.url} alt={selectedPhoto.filename}
                style={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain',borderRadius:'8px'}}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
