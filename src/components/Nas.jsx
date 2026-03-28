import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../utils/api';

const API_BASE = (window.location.hostname === 'localhost')
  ? 'http://localhost:3000/api'
  : 'https://st.looool.xyz/api';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB — Cloudflare 100MB 제한 대응

// ── 유틸 ──
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(typeof dateStr === 'number' ? dateStr * 1000 : dateStr);
  if (isNaN(d.getTime())) return '';
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function isImageFile(name) {
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(name);
}

function getFileIcon(name, isDir) {
  if (isDir) return '📁';
  if (isImageFile(name)) return '🖼️';
  if (/\.(mp4|mov|avi|mkv)$/i.test(name)) return '🎬';
  if (/\.(pdf)$/i.test(name)) return '📄';
  if (/\.(docx?|hwp|xlsx?|pptx?)$/i.test(name)) return '📝';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return '📦';
  return '📎';
}

// ── API 호출 ──
async function nasAPI(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/nas${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || `요청 실패: ${res.status}`);
  }
  return res;
}

async function nasJSON(path, options) {
  const res = await nasAPI(path, options);
  return res.json();
}

// ── 메인 컴포넌트 ──
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

  // ── 초기화 ──
  useEffect(() => { initNas(); }, []);

  const initNas = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await nasJSON('/init');
      setRepos(data.repos || []);

      // 라이브러리 용량 합산
      const totalUsage = (data.repos || []).reduce((sum, r) => sum + (r.size || 0), 0);
      setSpaceInfo({ usage: totalUsage });

      // 공용 라이브러리 우선 선택
      const shared = (data.repos || []).find(r => r.ownership === 'shared');
      if (shared) {
        setCurrentRepo(shared);
        await loadDir(shared.repo_id || shared.id, '/');
      } else if (data.repos?.length > 0) {
        const first = data.repos[0];
        setCurrentRepo(first);
        await loadDir(first.repo_id || first.id, '/');
      }
    } catch (e) {
      setError('NAS 초기화 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 디렉토리 로드 ──
  const loadDir = useCallback(async (repoId, path) => {
    try {
      setLoading(true);
      const data = await nasJSON(`/repos/${repoId}/dir?p=${encodeURIComponent(path)}`);
      const sorted = (data || []).sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      setEntries(sorted);
      setCurrentPath(path);
    } catch (e) {
      setError('폴더 조회 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 라이브러리 전환 ──
  const switchRepo = (repo) => {
    setCurrentRepo(repo);
    setCurrentPath('/');
    loadDir(repo.repo_id || repo.id, '/');
  };

  // ── 파일/폴더 클릭 ──
  const handleEntryClick = (entry) => {
    if (!currentRepo) return;
    const repoId = currentRepo.repo_id || currentRepo.id;
    if (entry.type === 'dir') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
      loadDir(repoId, newPath);
    } else if (isImageFile(entry.name)) {
      setPreviewFile(entry);
    } else {
      handleDownload(entry);
    }
  };

  // ── 상위 폴더 이동 ──
  const goUp = () => {
    if (currentPath === '/' || !currentRepo) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    loadDir(currentRepo.repo_id || currentRepo.id, newPath);
  };

  // ── 경로 네비게이션 ──
  const navigateTo = (index) => {
    if (!currentRepo) return;
    const parts = currentPath.split('/').filter(Boolean);
    if (index === -1) {
      loadDir(currentRepo.repo_id || currentRepo.id, '/');
    } else {
      const newPath = '/' + parts.slice(0, index + 1).join('/');
      loadDir(currentRepo.repo_id || currentRepo.id, newPath);
    }
  };

  // ── 파일 다운로드 ──
  const handleDownload = async (entry) => {
    if (!currentRepo) return;
    const repoId = currentRepo.repo_id || currentRepo.id;
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    try {
      const data = await nasJSON(`/repos/${repoId}/file?p=${encodeURIComponent(filePath)}`);
      const a = document.createElement('a');
      a.href = data.url;
      a.download = entry.name;
      a.target = '_blank';
      a.click();
    } catch (e) {
      alert('다운로드 실패: ' + e.message);
    }
  };

  // ── 파일 업로드 (chunked 지원) ──
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!currentRepo) { alert('라이브러리를 먼저 선택하세요.'); return; }
    const repoId = currentRepo.repo_id || currentRepo.id;

    const fileList = Array.from(files).map((f, i) => ({
      name: f.name, size: f.size, progress: 0, status: 'waiting', index: i,
    }));
    setUploadFiles(fileList);
    setUploading(true);

    try {
      const linkData = await nasJSON(`/repos/${repoId}/upload-link?p=${encodeURIComponent(currentPath)}`);
      const uploadApiUrl = linkData.upload_url.replace('/upload-aj/', '/upload-api/').replace('/upload/', '/upload-api/');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'uploading' } : f));

        try {
          if (file.size <= CHUNK_SIZE) {
            // 작은 파일: 일반 업로드
            await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', linkData.upload_url);
              xhr.setRequestHeader('Authorization', `Token ${linkData.token}`);
              xhr.upload.onprogress = (evt) => {
                if (evt.lengthComputable) {
                  const pct = Math.round((evt.loaded / evt.total) * 100);
                  setUploadFiles(prev => prev.map((f, j) => j === i ? { ...f, progress: pct } : f));
                }
              };
              xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}`));
              xhr.onerror = () => reject(new Error('네트워크 오류'));
              const formData = new FormData();
              formData.append('parent_dir', currentPath || '/');
              formData.append('file', file);
              xhr.send(formData);
            });
          } else {
            // 큰 파일: chunked upload
            const totalSize = file.size;
            const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
            let uploadedBytes = 0;

            for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
              const start = chunkIdx * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, totalSize);
              const chunk = file.slice(start, end);

              await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', uploadApiUrl);
                xhr.setRequestHeader('Authorization', `Token ${linkData.token}`);
                xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${totalSize}`);
                xhr.setRequestHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
                xhr.upload.onprogress = (evt) => {
                  if (evt.lengthComputable) {
                    const totalUploaded = uploadedBytes + evt.loaded;
                    const pct = Math.round((totalUploaded / totalSize) * 100);
                    setUploadFiles(prev => prev.map((f, j) => j === i ? { ...f, progress: pct } : f));
                  }
                };
                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) { uploadedBytes = end; resolve(); }
                  else reject(new Error(`Chunk ${chunkIdx + 1}/${totalChunks} 실패: ${xhr.status}`));
                };
                xhr.onerror = () => reject(new Error('네트워크 오류'));
                const formData = new FormData();
                formData.append('parent_dir', currentPath || '/');
                formData.append('file', chunk, file.name);
                xhr.send(formData);
              });
            }
          }
          setUploadFiles(prev => prev.map((f, j) => j === i ? { ...f, progress: 100, status: 'done' } : f));
        } catch (err) {
          setUploadFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'error', error: err.message } : f));
        }
      }
      await loadDir(repoId, currentPath);
    } catch (err) {
      alert('업로드 준비 실패: ' + err.message);
    } finally {
      setTimeout(() => { setUploading(false); setUploadFiles([]); }, 2000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── 삭제 ──
  const handleDelete = async (entry, e) => {
    if (e) e.stopPropagation();
    if (!confirm(`"${entry.name}"을(를) 삭제하시겠습니까?`)) return;
    if (!currentRepo) return;
    const repoId = currentRepo.repo_id || currentRepo.id;
    const entryPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    try {
      await nasJSON(`/repos/${repoId}/entry?p=${encodeURIComponent(entryPath)}`, { method: 'DELETE' });
      await loadDir(repoId, currentPath);
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  // ── 폴더 생성 ──
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentRepo) return;
    const repoId = currentRepo.repo_id || currentRepo.id;
    const dirPath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
    try {
      await nasJSON(`/repos/${repoId}/mkdir?p=${encodeURIComponent(dirPath)}`, { method: 'POST' });
      setNewFolderName('');
      setShowNewFolder(false);
      await loadDir(repoId, currentPath);
    } catch (e) {
      alert('폴더 생성 실패: ' + e.message);
    }
  };

  // ── 뷰 모드 전환 ──
  const toggleView = () => {
    const next = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    localStorage.setItem('nas_viewMode', next);
  };

  // ── 썸네일 URL ──
  const thumbnailUrl = (entry) => {
    if (!isImageFile(entry.name) || !currentRepo) return null;
    const repoId = currentRepo.repo_id || currentRepo.id;
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    return `${API_BASE}/nas/repos/${repoId}/thumbnail?p=${encodeURIComponent(filePath)}&size=256`;
  };

  // ── 미리보기 URL ──
  const previewUrl = (entry) => {
    if (!currentRepo) return '';
    const repoId = currentRepo.repo_id || currentRepo.id;
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    return `${API_BASE}/nas/repos/${repoId}/download?p=${encodeURIComponent(filePath)}`;
  };

  // ── 빵 부스러기 ──
  const breadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    return [{ label: currentRepo?.name || 'NAS', index: -1 }, ...parts.map((p, i) => ({ label: p, index: i }))];
  };

  // ========== 렌더 ==========

  if (loading && repos.length === 0) {
    return (
      <div style={S.center}>
        <div className="spinner"></div>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>NAS 연결 중...</p>
      </div>
    );
  }

  if (error && repos.length === 0) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>
        <button className="btn btn-primary" onClick={initNas} style={{ marginTop: 12 }}>다시 시도</button>
      </div>
    );
  }

  return (
    <div style={S.container}>
      {/* ── 헤더 ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h2 style={S.title}>NAS</h2>
          <div style={S.repoTabs}>
            {repos.map(r => {
              const id = r.repo_id || r.id;
              const active = (currentRepo?.repo_id || currentRepo?.id) === id;
              return (
                <button key={id} onClick={() => switchRepo(r)}
                  style={{ ...S.repoTab, ...(active ? S.repoTabActive : {}) }}>
                  {r.ownership === 'shared' ? '👥' : '👤'} {r.name || r.repo_name}
                </button>
              );
            })}
          </div>
          {spaceInfo && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              사용 중: {formatSize(spaceInfo.usage)}
            </span>
          )}
        </div>
        <div style={S.headerRight}>
          <button onClick={toggleView} style={S.iconBtn} title={viewMode === 'grid' ? '목록 보기' : '격자 보기'}>
            {viewMode === 'grid' ? '☰' : '⊞'}
          </button>
          <button onClick={() => setShowNewFolder(true)} style={S.iconBtn} title="새 폴더">📁+</button>
          <button onClick={() => fileInputRef.current?.click()} style={S.uploadBtn} disabled={uploading}>
            📤 업로드
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      </div>

      {/* ── 빵 부스러기 + 새 폴더 ── */}
      <div style={S.toolbar}>
        <div style={S.breadcrumbs}>
          {currentPath !== '/' && (
            <button onClick={goUp} style={S.breadcrumbBtn} title="상위 폴더">⬆</button>
          )}
          {breadcrumbs().map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={S.breadcrumbSep}>/</span>}
              <button onClick={() => navigateTo(b.index)} style={S.breadcrumbBtn}>{b.label}</button>
            </React.Fragment>
          ))}
        </div>
        {showNewFolder && (
          <div style={S.newFolderRow}>
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="새 폴더 이름" style={S.newFolderInput} autoFocus />
            <button onClick={handleCreateFolder} className="btn btn-primary btn-sm">생성</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="btn btn-outline btn-sm">취소</button>
          </div>
        )}
      </div>

      {/* ── 파일 목록 ── */}
      {loading ? (
        <div style={S.center}><div className="spinner"></div></div>
      ) : entries.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 48 }}>📂</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>비어있는 폴더입니다</p>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 12 }}>
            📤 파일 업로드
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* ── 격자 보기 ── */
        <div style={S.grid}>
          {entries.map((entry, i) => (
            <div key={i} className="nas-grid-item" style={S.gridItem} onClick={() => handleEntryClick(entry)}>
              <div style={S.thumbWrap}>
                {isImageFile(entry.name) ? (
                  <img src={thumbnailUrl(entry)} alt={entry.name} style={S.thumbImg} loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.querySelector('.fallback').style.display = 'flex'; }} />
                ) : null}
                <div className="fallback" style={{ ...S.fileIconBig, display: isImageFile(entry.name) ? 'none' : 'flex' }}>
                  {getFileIcon(entry.name, entry.type === 'dir')}
                </div>
              </div>
              <div style={S.gridItemInfo}>
                <span style={S.gridItemName} title={entry.name}>{entry.name}</span>
                <div style={S.gridItemBottom}>
                  <span style={S.gridItemMeta}>
                    {entry.type === 'dir' ? '폴더' : formatSize(entry.size)}
                  </span>
                  <div style={S.gridItemActions}>
                    {entry.type !== 'dir' && (
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(entry); }}
                        style={S.actionBtn} title="다운로드">⬇</button>
                    )}
                    <button onClick={(e) => handleDelete(entry, e)}
                      style={{ ...S.actionBtn, color: 'var(--danger)' }} title="삭제">✕</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── 목록 보기 ── */
        <div style={S.list}>
          {entries.map((entry, i) => (
            <div key={i} className="nas-list-item" style={S.listItem} onClick={() => handleEntryClick(entry)}>
              <span style={S.listIcon}>{getFileIcon(entry.name, entry.type === 'dir')}</span>
              <span style={S.listName}>{entry.name}</span>
              <span style={S.listDate}>{formatDate(entry.mtime)}</span>
              <span style={S.listSize}>{entry.type === 'dir' ? '—' : formatSize(entry.size)}</span>
              <div style={S.listActions}>
                {entry.type !== 'dir' && (
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(entry); }} style={S.actionBtn}>⬇</button>
                )}
                <button onClick={(e) => handleDelete(entry, e)}
                  style={{ ...S.actionBtn, color: 'var(--danger)' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 업로드 진행 모달 ── */}
      {uploading && uploadFiles.length > 0 && (
        <div style={S.modalOverlay}>
          <div style={S.uploadModal}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>
              📤 파일 업로드 ({uploadFiles.filter(f => f.status === 'done').length}/{uploadFiles.length})
            </h3>
            {uploadFiles.map((f, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                    {f.name}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : f.status === 'uploading' ? `${f.progress}%` : '⏳'}
                    {' '}{formatSize(f.size)}
                  </span>
                </div>
                <div style={S.progressTrack}>
                  <div style={{
                    ...S.progressBar,
                    width: `${f.progress}%`,
                    background: f.status === 'error' ? 'var(--danger)' : f.status === 'done' ? 'var(--success)' : 'var(--primary)',
                  }} />
                </div>
                {f.status === 'error' && (
                  <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{f.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 이미지 미리보기 모달 ── */}
      {previewFile && (
        <div style={S.modalOverlay} onClick={() => setPreviewFile(null)}>
          <div style={S.previewContent} onClick={e => e.stopPropagation()}>
            <button style={S.previewClose} onClick={() => setPreviewFile(null)}>✕</button>
            <img src={previewUrl(previewFile)} alt={previewFile.name} style={S.previewImg} />
            <div style={S.previewInfo}>
              <span>{previewFile.name}</span>
              <span>{formatSize(previewFile.size)}</span>
              <button className="btn btn-primary btn-sm" onClick={() => handleDownload(previewFile)}>⬇ 다운로드</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Seafile 바로가기 ── */}
      <div style={S.footer}>
        <a href="https://nas2.looool.xyz" target="_blank" rel="noreferrer" style={S.footerLink}>
          🌊 Seafile 웹에서 열기 →
        </a>
      </div>
    </div>
  );
}

// ── 스타일 ──
const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', gap: 0 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', height: '100%', minHeight: 300 },
  // Header
  header: {
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
    padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' },
  repoTabs: { display: 'flex', gap: 4 },
  repoTab: {
    padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', transition: 'var(--transition)',
  },
  repoTabActive: { background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)', fontWeight: 600 },
  iconBtn: { padding: '6px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 15 },
  uploadBtn: { padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  // Toolbar
  toolbar: { padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  breadcrumbs: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' },
  breadcrumbBtn: { padding: '4px 8px', border: 'none', background: 'none', color: 'var(--primary-dark)', fontSize: 13, cursor: 'pointer', borderRadius: 4 },
  breadcrumbSep: { color: 'var(--text-tertiary)', fontSize: 12 },
  newFolderRow: { display: 'flex', gap: 8, alignItems: 'center' },
  newFolderInput: { padding: '6px 12px', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', fontSize: 13, flex: 1, maxWidth: 250 },
  // Grid
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 12, padding: '4px 20px 20px', overflowY: 'auto', flex: 1,
  },
  gridItem: {
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer', overflow: 'hidden', transition: 'var(--transition)', display: 'flex', flexDirection: 'column',
  },
  thumbWrap: {
    width: '100%', height: 120, background: 'var(--bg-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  fileIconBig: { fontSize: 36, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  gridItemInfo: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 },
  gridItemName: { fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  gridItemBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gridItemMeta: { fontSize: 11, color: 'var(--text-tertiary)' },
  gridItemActions: { display: 'flex', gap: 2 },
  // List
  list: { display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 20px 20px', overflowY: 'auto', flex: 1 },
  listItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'var(--transition)',
  },
  listIcon: { fontSize: 20, flexShrink: 0 },
  listName: { flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listDate: { fontSize: 12, color: 'var(--text-tertiary)', width: 90, textAlign: 'right' },
  listSize: { fontSize: 12, color: 'var(--text-tertiary)', width: 70, textAlign: 'right' },
  listActions: { display: 'flex', gap: 4, flexShrink: 0 },
  // Buttons
  actionBtn: {
    padding: '3px 7px', border: 'none', background: 'rgba(0,0,0,0.06)',
    borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1,
  },
  // Modals
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  uploadModal: {
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
    padding: 24, width: '90%', maxWidth: 480, maxHeight: '70vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)',
  },
  progressTrack: { height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  previewContent: {
    position: 'relative', maxWidth: '90vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  previewClose: { position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' },
  previewImg: { maxWidth: '90vw', maxHeight: '75vh', borderRadius: 8, objectFit: 'contain' },
  previewInfo: { display: 'flex', gap: 16, alignItems: 'center', color: 'white', fontSize: 13 },
  // Empty
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 300 },
  // Footer
  footer: { padding: '8px 20px', textAlign: 'center' },
  footerLink: { fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' },
};

// CSS hover 효과
if (!document.getElementById('nas-hover-css')) {
  const style = document.createElement('style');
  style.id = 'nas-hover-css';
  style.textContent = `
    .nas-grid-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
    .nas-list-item:hover { background: var(--bg-hover) !important; }
  `;
  document.head.appendChild(style);
}
