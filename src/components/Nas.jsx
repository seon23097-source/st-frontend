import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../utils/api';

const API_BASE = (window.location.hostname === 'localhost')
  ? 'http://localhost:3000/api'
  : 'https://st.looool.xyz/api';

const CHUNK_SIZE = 50 * 1024 * 1024;

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(typeof v === 'number' ? v * 1000 : v);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function isImageFile(n) { return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(n); }

function getFileIcon(n, isDir) {
  if (isDir) return '📁';
  if (isImageFile(n)) return '🖼️';
  if (/\.(mp4|mov|avi|mkv)$/i.test(n)) return '🎬';
  if (/\.(pdf)$/i.test(n)) return '📄';
  if (/\.(docx?|hwp|xlsx?|pptx?)$/i.test(n)) return '📝';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(n)) return '📦';
  return '📎';
}

async function nasAPI(path, opts = {}) {
  const res = await fetch(`${API_BASE}/nas${path}`, { ...opts, headers: { Authorization: `Bearer ${getToken()}`, ...opts.headers } });
  if (!res.ok) throw new Error(await res.text().catch(() => '') || `${res.status}`);
  return res;
}
async function nasJSON(path, opts) { return (await nasAPI(path, opts)).json(); }

export default function Nas() {
  const [repos, setRepos] = useState([]);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('nas_viewMode') || 'grid');
  const [previewFile, setPreviewFile] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [spaceInfo, setSpaceInfo] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { initNas(); }, []);

  const initNas = async () => {
    try {
      setLoading(true); setError(null);
      const data = await nasJSON('/init');
      setRepos(data.repos || []);
      nasJSON('/space').then(s => setSpaceInfo(s)).catch(() => {});
      const shared = (data.repos || []).find(r => r.ownership === 'shared');
      const first = shared || (data.repos || [])[0];
      if (first) { setCurrentRepo(first); await loadDir(first.repo_id || first.id, '/'); }
    } catch (e) { setError('NAS 초기화 실패: ' + e.message); }
    finally { setLoading(false); }
  };

  const loadDir = useCallback(async (repoId, path) => {
    try {
      setLoading(true);
      const data = await nasJSON(`/repos/${repoId}/dir?p=${encodeURIComponent(path)}`);
      setEntries((data || []).sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return (a.name || '').localeCompare(b.name || '');
      }));
      setCurrentPath(path);
    } catch (e) { setError('폴더 조회 실패: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  const switchRepo = (r) => { setCurrentRepo(r); setCurrentPath('/'); loadDir(r.repo_id || r.id, '/'); };

  const handleEntryClick = (entry) => {
    if (!currentRepo) return;
    const rid = currentRepo.repo_id || currentRepo.id;
    if (entry.type === 'dir') loadDir(rid, currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`);
    else if (isImageFile(entry.name)) setPreviewFile(entry);
    else handleDownload(entry);
  };

  const goUp = () => {
    if (currentPath === '/' || !currentRepo) return;
    const parts = currentPath.split('/').filter(Boolean); parts.pop();
    loadDir(currentRepo.repo_id || currentRepo.id, parts.length === 0 ? '/' : '/' + parts.join('/'));
  };

  const navigateTo = (idx) => {
    if (!currentRepo) return;
    const parts = currentPath.split('/').filter(Boolean);
    loadDir(currentRepo.repo_id || currentRepo.id, idx === -1 ? '/' : '/' + parts.slice(0, idx + 1).join('/'));
  };

  const handleDownload = async (entry) => {
    if (!currentRepo) return;
    const fp = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    try {
      const data = await nasJSON(`/repos/${currentRepo.repo_id || currentRepo.id}/file?p=${encodeURIComponent(fp)}`);
      Object.assign(document.createElement('a'), { href: data.url, download: entry.name, target: '_blank' }).click();
    } catch (e) { alert('다운로드 실패: ' + e.message); }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || !files.length || !currentRepo) return;
    const rid = currentRepo.repo_id || currentRepo.id;
    const fl = Array.from(files).map((f, i) => ({ name: f.name, size: f.size, progress: 0, status: 'waiting', index: i }));
    setUploadFiles(fl); setUploading(true);
    try {
      const ld = await nasJSON(`/repos/${rid}/upload-link?p=${encodeURIComponent(currentPath)}`);
      const apiUrl = ld.upload_url.replace('/upload-aj/', '/upload-api/').replace('/upload/', '/upload-api/');
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadFiles(p => p.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));
        try {
          if (file.size <= CHUNK_SIZE) {
            await new Promise((ok, fail) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', ld.upload_url);
              xhr.setRequestHeader('Authorization', `Token ${ld.token}`);
              xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadFiles(p => p.map((f, j) => j === i ? { ...f, progress: Math.round(ev.loaded / ev.total * 100) } : f)); };
              xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? ok() : fail(new Error(`${xhr.status}`));
              xhr.onerror = () => fail(new Error('네트워크 오류'));
              const fd = new FormData(); fd.append('parent_dir', currentPath || '/'); fd.append('file', file);
              xhr.send(fd);
            });
          } else {
            const ts = file.size, tc = Math.ceil(ts / CHUNK_SIZE);
            let ub = 0;
            for (let ci = 0; ci < tc; ci++) {
              const start = ci * CHUNK_SIZE, end = Math.min(start + CHUNK_SIZE, ts);
              await new Promise((ok, fail) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', apiUrl);
                xhr.setRequestHeader('Authorization', `Token ${ld.token}`);
                xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${ts}`);
                xhr.setRequestHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
                xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadFiles(p => p.map((f, j) => j === i ? { ...f, progress: Math.round((ub + ev.loaded) / ts * 100) } : f)); };
                xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { ub = end; ok(); } else fail(new Error(`Chunk ${ci+1}/${tc}: ${xhr.status}`)); };
                xhr.onerror = () => fail(new Error('네트워크 오류'));
                const fd = new FormData(); fd.append('parent_dir', currentPath || '/'); fd.append('file', file.slice(start, end), file.name);
                xhr.send(fd);
              });
            }
          }
          setUploadFiles(p => p.map((f, j) => j === i ? { ...f, progress: 100, status: 'done' } : f));
        } catch (err) {
          setUploadFiles(p => p.map((f, j) => j === i ? { ...f, status: 'error', error: err.message } : f));
        }
      }
      await loadDir(rid, currentPath);
      nasJSON('/space').then(s => setSpaceInfo(s)).catch(() => {});
    } catch (err) { alert('업로드 실패: ' + err.message); }
    finally { setTimeout(() => { setUploading(false); setUploadFiles([]); }, 2000); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDelete = async (entry, e) => {
    if (e) e.stopPropagation();
    if (!confirm(`"${entry.name}" 삭제?`) || !currentRepo) return;
    const rid = currentRepo.repo_id || currentRepo.id;
    const ep = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    try { await nasJSON(`/repos/${rid}/entry?p=${encodeURIComponent(ep)}`, { method: 'DELETE' }); await loadDir(rid, currentPath); nasJSON('/space').then(s => setSpaceInfo(s)).catch(() => {}); }
    catch (e2) { alert('삭제 실패: ' + e2.message); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentRepo) return;
    const rid = currentRepo.repo_id || currentRepo.id;
    const dp = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
    try { await nasJSON(`/repos/${rid}/mkdir?p=${encodeURIComponent(dp)}`, { method: 'POST' }); setNewFolderName(''); setShowNewFolder(false); await loadDir(rid, currentPath); }
    catch (e) { alert('폴더 생성 실패: ' + e.message); }
  };

  const toggleView = () => { const n = viewMode === 'grid' ? 'list' : 'grid'; setViewMode(n); localStorage.setItem('nas_viewMode', n); };

  const thumbUrl = (entry) => {
    if (!isImageFile(entry.name) || !currentRepo) return null;
    const fp = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    return `${API_BASE}/nas/repos/${currentRepo.repo_id || currentRepo.id}/thumbnail?p=${encodeURIComponent(fp)}&size=256`;
  };

  const prevUrl = (entry) => {
    if (!currentRepo) return '';
    const fp = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    return `${API_BASE}/nas/repos/${currentRepo.repo_id || currentRepo.id}/download?p=${encodeURIComponent(fp)}`;
  };

  const crumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    return [{ label: currentRepo?.name || 'NAS', index: -1 }, ...parts.map((p, i) => ({ label: p, index: i }))];
  };

  if (loading && !repos.length) return <div style={S.center}><div className="spinner" /><p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>NAS 연결 중...</p></div>;
  if (error && !repos.length) return <div style={S.center}><div style={{ fontSize: 48 }}>⚠️</div><p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p><button className="btn btn-primary" onClick={initNas} style={{ marginTop: 12 }}>다시 시도</button></div>;

  return (
    <div style={S.container}>
      {/* 헤더 */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h2 style={S.title}>NAS</h2>
          <div style={S.repoTabs}>
            {repos.map(r => {
              const id = r.repo_id || r.id, act = (currentRepo?.repo_id || currentRepo?.id) === id;
              return <button key={id} onClick={() => switchRepo(r)} style={{ ...S.repoTab, ...(act ? S.repoTabActive : {}) }}>{r.ownership === 'shared' ? '👥' : '👤'} {r.name || r.repo_name}</button>;
            })}
          </div>
          {spaceInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {spaceInfo.total > 0 ? (<>
                <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, spaceInfo.usage / spaceInfo.total * 100)}%`, background: spaceInfo.usage / spaceInfo.total > 0.85 ? 'var(--danger)' : 'var(--primary)' }} />
                </div>
                <span>{formatSize(spaceInfo.usage)} / {formatSize(spaceInfo.total)}</span>
              </>) : <span>사용 중: {formatSize(spaceInfo.usage)}</span>}
            </div>
          )}
        </div>
        <div style={S.headerRight}>
          <button onClick={toggleView} style={S.iconBtn}>{viewMode === 'grid' ? '☰' : '⊞'}</button>
          <button onClick={() => setShowNewFolder(true)} style={S.iconBtn}>📁+</button>
          <button onClick={() => fileInputRef.current?.click()} style={S.uploadBtn} disabled={uploading}>📤 업로드</button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      </div>

      {/* 빵부스러기 */}
      <div style={S.toolbar}>
        <div style={S.crumbs}>
          {currentPath !== '/' && <button onClick={goUp} style={S.crumbBtn}>⬆</button>}
          {crumbs().map((b, i) => <React.Fragment key={i}>{i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>/</span>}<button onClick={() => navigateTo(b.index)} style={S.crumbBtn}>{b.label}</button></React.Fragment>)}
        </div>
        {showNewFolder && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} placeholder="새 폴더 이름" style={S.folderInput} autoFocus />
            <button onClick={handleCreateFolder} className="btn btn-primary btn-sm">생성</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="btn btn-outline btn-sm">취소</button>
          </div>
        )}
      </div>

      {/* 파일 목록 */}
      {loading ? <div style={S.center}><div className="spinner" /></div>
      : !entries.length ? (
        <div style={S.empty}><div style={{ fontSize: 48 }}>📂</div><p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>비어있는 폴더</p><button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 12 }}>📤 업로드</button></div>
      ) : viewMode === 'grid' ? (
        <div style={S.grid}>{entries.map((en, i) => (
          <div key={i} className="nas-grid-item" style={S.gridItem} onClick={() => handleEntryClick(en)}>
            <div style={S.thumb}>{isImageFile(en.name) ? <img src={thumbUrl(en)} alt="" style={S.thumbImg} loading="lazy" onError={e => { e.target.style.display='none'; }} /> : null}{!isImageFile(en.name) && <div style={{ fontSize: 36 }}>{getFileIcon(en.name, en.type === 'dir')}</div>}</div>
            <div style={S.gridInfo}>
              <span style={S.gridName} title={en.name}>{en.name}</span>
              <div style={S.gridBottom}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{en.type === 'dir' ? '폴더' : formatSize(en.size)}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {en.type !== 'dir' && <button onClick={e => { e.stopPropagation(); handleDownload(en); }} style={S.act}>⬇</button>}
                  <button onClick={e => handleDelete(en, e)} style={{ ...S.act, color: 'var(--danger)' }}>✕</button>
                </div>
              </div>
            </div>
          </div>
        ))}</div>
      ) : (
        <div style={S.list}>{entries.map((en, i) => (
          <div key={i} className="nas-list-item" style={S.listItem} onClick={() => handleEntryClick(en)}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{getFileIcon(en.name, en.type === 'dir')}</span>
            <span style={S.listName}>{en.name}</span>
            <span style={S.listMeta}>{formatDate(en.mtime)}</span>
            <span style={{ ...S.listMeta, width: 70 }}>{en.type === 'dir' ? '—' : formatSize(en.size)}</span>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {en.type !== 'dir' && <button onClick={e => { e.stopPropagation(); handleDownload(en); }} style={S.act}>⬇</button>}
              <button onClick={e => handleDelete(en, e)} style={{ ...S.act, color: 'var(--danger)' }}>✕</button>
            </div>
          </div>
        ))}</div>
      )}

      {/* 업로드 모달 */}
      {uploading && uploadFiles.length > 0 && (
        <div style={S.overlay}><div style={S.modal}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>📤 업로드 ({uploadFiles.filter(f => f.status === 'done').length}/{uploadFiles.length})</h3>
          {uploadFiles.map((f, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{f.name}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : f.status === 'uploading' ? `${f.progress}%` : '⏳'} {formatSize(f.size)}</span>
              </div>
              <div style={S.pTrack}><div style={{ ...S.pBar, width: `${f.progress}%`, background: f.status === 'error' ? 'var(--danger)' : f.status === 'done' ? 'var(--success)' : 'var(--primary)' }} /></div>
              {f.status === 'error' && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{f.error}</div>}
            </div>
          ))}
        </div></div>
      )}

      {/* 미리보기 */}
      {previewFile && (
        <div style={S.overlay} onClick={() => setPreviewFile(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
            <button style={{ position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }} onClick={() => setPreviewFile(null)}>✕</button>
            <img src={prevUrl(previewFile)} alt={previewFile.name} style={{ maxWidth: '90vw', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'white', fontSize: 13 }}>
              <span>{previewFile.name}</span><span>{formatSize(previewFile.size)}</span>
              <button className="btn btn-primary btn-sm" onClick={() => handleDownload(previewFile)}>⬇ 다운로드</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 20px', textAlign: 'center' }}><a href="https://nas2.looool.xyz" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' }}>🌊 Seafile 웹에서 열기 →</a></div>
    </div>
  );
}

const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', height: '100%', minHeight: 300 },
  header: { background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' },
  repoTabs: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  repoTab: { padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' },
  repoTabActive: { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)', fontWeight: 600 },
  iconBtn: { padding: '6px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 15 },
  uploadBtn: { padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toolbar: { padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  crumbs: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' },
  crumbBtn: { padding: '4px 8px', border: 'none', background: 'none', color: 'var(--primary-dark)', fontSize: 13, cursor: 'pointer', borderRadius: 4 },
  folderInput: { padding: '6px 12px', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', fontSize: 13, flex: 1, maxWidth: 250 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, padding: '4px 20px 20px', overflowY: 'auto', flex: 1, alignItems: 'start' },
  gridItem: { background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  thumb: { width: '100%', height: 110, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  gridInfo: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 },
  gridName: { fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  gridBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 20px 20px', overflowY: 'auto', flex: 1 },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  listName: { flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listMeta: { fontSize: 12, color: 'var(--text-tertiary)', width: 90, textAlign: 'right' },
  act: { padding: '3px 7px', border: 'none', background: 'rgba(0,0,0,0.06)', borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', padding: 24, width: '90%', maxWidth: 480, maxHeight: '70vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' },
  pTrack: { height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' },
  pBar: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 300 },
};

if (!document.getElementById('nas-css')) {
  const s = document.createElement('style'); s.id = 'nas-css';
  s.textContent = '.nas-grid-item:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)!important}.nas-list-item:hover{background:var(--bg-hover)!important}';
  document.head.appendChild(s);
}
