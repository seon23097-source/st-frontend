import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getToken } from '../utils/api';

const API_BASE = (window.location.hostname === 'localhost')
  ? 'http://localhost:3000/api'
  : 'https://st.looool.xyz/api';

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
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
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
  const [uploadFiles, setUploadFiles] = useState([]); // [{name, size, progress, status}]
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('nas_viewMode') || 'grid');
  const [previewFile, setPreviewFile] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [spaceInfo, setSpaceInfo] = useState(null);
  const fileInputRef = useRef(null);

  // ── 초기화 ──
  useEffect(() => {
    initNas();
  }, []);

  const initNas = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await nasJSON('/init');
      setRepos(data.repos || []);
      // 용량 조회
      nasJSON('/space').then(s => setSpaceInfo(s)).catch(() => {});
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
      // 정렬: 폴더 먼저, 이름 순
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
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    loadDir(currentRepo.repo_id || currentRepo.id, newPath);
  };

  // ── 경로 네비게이션 ──
  const navigateTo = (index) => {
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


  // ── 파일 업로드 ──

  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB — Cloudflare 100MB 제한 대응

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
      // upload-link URL에서 upload-api URL 생성 (chunked용)
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
              const isLast = (chunkIdx === totalChunks - 1);

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
                  if (xhr.status >= 200 && xhr.status < 300) {
                    uploadedBytes = end;
                    resolve();
                  } else {
                    reject(new Error(`Chunk ${chunkIdx + 1}/${totalChunks} 실패: ${xhr.status}`));
                  }
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
      setTimeout(() => {
        setUploading(false);
        setUploadFiles([]);
      }, 2000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  // ── 삭제 ──
  const handleDelete = async (entry) => {
    if (!confirm(`"${entry.name}"을(를) 삭제하시겠습니까?`)) return;
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
    if (!newFolderName.trim()) return;
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
    if (!isImageFile(entry.name)) return null;
    const repoId = currentRepo.repo_id || currentRepo.id;
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    const token = getToken();
    return `${API_BASE}/nas/repos/${repoId}/thumbnail?p=${encodeURIComponent(filePath)}&size=256&token=${token}`;
  };

  // ── 미리보기 URL ──
  const previewUrl = (entry) => {
    const repoId = currentRepo.repo_id || currentRepo.id;
    const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    const token = getToken();
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
      <div style={styles.center}>
        <div className="spinner"></div>
        <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>NAS 연결 중...</p>
      </div>
    );
  }

  if (error && repos.length === 0) {
    return (
      <div style={styles.center}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>
        <button className="btn btn-primary" onClick={initNas} style={{ marginTop: 12 }}>다시 시도</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* ── 헤더 ── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>NAS</h2>
          <div style={styles.repoTabs}>
          {spaceInfo && spaceInfo.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{
                width: 80, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${Math.min(100, (spaceInfo.usage / spaceInfo.total) * 100)}%`,
                  background: (spaceInfo.usage / spaceInfo.total) > 0.9 ? 'var(--danger)' : 'var(--primary)',
                }} />
              </div>
              <span>{formatSize(spaceInfo.usage)} / {formatSize(spaceInfo.total)}</span>
            </div>
          )}
            {repos.map(r => {
              const id = r.repo_id || r.id;
              const active = (currentRepo?.repo_id || currentRepo?.id) === id;
              return (
                <button
                  key={id}
                  onClick={() => switchRepo(r)}
                  style={{
                    ...styles.repoTab,
                    ...(active ? styles.repoTabActive : {}),
                  }}
                >
                  {r.ownership === 'shared' ? '👥' : '👤'} {r.name || r.repo_name}
                </button>
              );
            })}
          </div>
        </div>
        <div style={styles.headerRight}>
          <button onClick={toggleView} style={styles.iconBtn} title={viewMode === 'grid' ? '목록 보기' : '격자 보기'}>
            {viewMode === 'grid' ? '☰' : '⊞'}
          </button>
          <button onClick={() => setShowNewFolder(true)} style={styles.iconBtn} title="새 폴더">
            📁+
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={styles.uploadBtn}
            disabled={uploading}
          >
            {uploading ? `⏳ ${uploadProgress}` : '📤 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* ── 빵 부스러기 + 새 폴더 입력 ── */}
      <div style={styles.toolbar}>
        <div style={styles.breadcrumbs}>
          {currentPath !== '/' && (
            <button onClick={goUp} style={styles.breadcrumbBtn} title="상위 폴더">⬆</button>
          )}
          {breadcrumbs().map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={styles.breadcrumbSep}>/</span>}
              <button onClick={() => navigateTo(b.index)} style={styles.breadcrumbBtn}>
                {b.label}
              </button>
            </React.Fragment>
          ))}
        </div>
        {showNewFolder && (
          <div style={styles.newFolderRow}>
            <input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              placeholder="새 폴더 이름"
              style={styles.newFolderInput}
              autoFocus
            />
            <button onClick={handleCreateFolder} className="btn btn-primary btn-sm">생성</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="btn btn-outline btn-sm">취소</button>
          </div>
        )}
      </div>

      {/* ── 파일 목록 ── */}
      {loading ? (
        <div style={styles.center}><div className="spinner"></div></div>
      ) : entries.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48 }}>📂</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>비어있는 폴더입니다</p>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 12 }}>
            📤 파일 업로드
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={styles.grid}>
          {entries.map((entry, i) => (
            <div
              key={i}
              style={styles.gridItem}
              onClick={() => handleEntryClick(entry)}
              onContextMenu={(e) => { e.preventDefault(); }}
            >
              {isImageFile(entry.name) ? (
                <div style={styles.thumbWrap}>
                  <img
                    src={thumbnailUrl(entry)}
                    alt={entry.name}
                    style={styles.thumbImg}
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                  <div style={{ ...styles.thumbFallback, display: 'none' }}>🖼️</div>
                </div>
              ) : (
                <div style={styles.thumbWrap}>
                  <div style={styles.fileIconBig}>{getFileIcon(entry.name, entry.type === 'dir')}</div>
                </div>
              )}
              <div style={styles.gridItemInfo}>
                <span style={styles.gridItemName} title={entry.name}>{entry.name}</span>
                <span style={styles.gridItemMeta}>
                  {entry.type === 'dir' ? '폴더' : formatSize(entry.size)}
                </span>
              </div>
              {entry.type !== 'dir' && (
                <div style={styles.gridItemActions}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDownload(entry); }}
                    style={styles.smallBtn}
                    title="다운로드"
                  >⬇</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                    style={{ ...styles.smallBtn, color: 'var(--danger)' }}
                    title="삭제"
                  >✕</button>
                </div>
              )}
              {entry.type === 'dir' && (
                <div style={styles.gridItemActions}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                    style={{ ...styles.smallBtn, color: 'var(--danger)' }}
                    title="삭제"
                  >✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.list}>
          {entries.map((entry, i) => (
            <div
              key={i}
              style={styles.listItem}
              onClick={() => handleEntryClick(entry)}
            >
              <span style={styles.listIcon}>{getFileIcon(entry.name, entry.type === 'dir')}</span>
              <span style={styles.listName}>{entry.name}</span>
              <span style={styles.listDate}>{formatDate(entry.mtime ? entry.mtime * 1000 : entry.last_modified)}</span>
              <span style={styles.listSize}>{entry.type === 'dir' ? '—' : formatSize(entry.size)}</span>
              <div style={styles.listActions}>
                {entry.type !== 'dir' && (
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(entry); }} style={styles.smallBtn}>⬇</button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                  style={{ ...styles.smallBtn, color: 'var(--danger)' }}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 업로드 진행 모달 ── */}
      {uploading && uploadFiles.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
            padding: 24, width: '90%', maxWidth: 480, maxHeight: '70vh', overflow: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text-primary)' }}>
              📤 파일 업로드 ({uploadFiles.filter(f => f.status === 'done').length}/{uploadFiles.length})
            </h3>
            {uploadFiles.map((f, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{
                    color: 'var(--text-primary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
                  }}>{f.name}</span>
                  <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : f.status === 'uploading' ? `${f.progress}%` : '⏳'}
                    {' '}{formatSize(f.size)}
                  </span>
                </div>
                <div style={{
                  height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3, transition: 'width 0.3s',
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
        <div style={styles.previewOverlay} onClick={() => setPreviewFile(null)}>
          <div style={styles.previewContent} onClick={e => e.stopPropagation()}>
            <button style={styles.previewClose} onClick={() => setPreviewFile(null)}>✕</button>
            <img
              src={previewUrl(previewFile)}
              alt={previewFile.name}
              style={styles.previewImg}
            />
            <div style={styles.previewInfo}>
              <span>{previewFile.name}</span>
              <span>{formatSize(previewFile.size)}</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleDownload(previewFile)}
              >⬇ 다운로드</button>
            </div>
          </div>
        </div>
      )}

      {/* Seafile 바로가기 (하단) */}
      <div style={styles.footer}>
        <a
          href="https://nas2.looool.xyz"
          target="_blank"
          rel="noreferrer"
          style={styles.footerLink}
        >
          🌊 Seafile 웹에서 열기 →
        </a>
      </div>
    </div>
  );
}

// ── 스타일 ──
const styles = {
  container: {
    display: 'flex', flexDirection: 'column', height: '100%', gap: 0,
  },
  center: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'column', height: '100%', minHeight: 300,
  },
  header: {
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)', padding: '12px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 8,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' },
  repoTabs: { display: 'flex', gap: 4 },
  repoTab: {
    padding: '6px 14px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-light)', background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
    transition: 'var(--transition)',
  },
  repoTabActive: {
    background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)',
    fontWeight: 600,
  },
  iconBtn: {
    padding: '6px 10px', border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)',
    cursor: 'pointer', fontSize: 15,
  },
  uploadBtn: {
    padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
    background: 'var(--primary)', color: 'white', fontSize: 13,
    fontWeight: 600, cursor: 'pointer',
  },
  toolbar: {
    padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  breadcrumbs: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' },
  breadcrumbBtn: {
    padding: '4px 8px', border: 'none', background: 'none',
    color: 'var(--primary-dark)', fontSize: 13, cursor: 'pointer',
    borderRadius: 4,
  },
  breadcrumbSep: { color: 'var(--text-tertiary)', fontSize: 12 },
  newFolderRow: { display: 'flex', gap: 8, alignItems: 'center' },
  newFolderInput: {
    padding: '6px 12px', border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm)', fontSize: 13, flex: 1, maxWidth: 250,
  },
  // Grid
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 12, padding: '4px 20px 20px', overflowY: 'auto', flex: 1,
  },
  gridItem: {
    background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-sm)', cursor: 'pointer', overflow: 'hidden',
    transition: 'var(--transition)', position: 'relative',
    display: 'flex', flexDirection: 'column',
    maxHeight: 220,
  },
  thumbWrap: {
    width: '100%', height: 120, background: 'var(--bg-tertiary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbFallback: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
    fontSize: 40,
  },
  fileIconBig: { fontSize: 40 },
  gridItemInfo: {
    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2,
  },
  gridItemName: {
    fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  gridItemMeta: { fontSize: 11, color: 'var(--text-tertiary)' },
  gridItemActions: {
    position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2,
    opacity: 0,
  },
  // List
  list: {
    display: 'flex', flexDirection: 'column', gap: 1,
    padding: '4px 20px 20px', overflowY: 'auto', flex: 1,
  },
  listItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
    transition: 'var(--transition)',
  },
  listIcon: { fontSize: 20, flexShrink: 0 },
  listName: {
    flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  listDate: { fontSize: 12, color: 'var(--text-tertiary)', width: 90, textAlign: 'right' },
  listSize: { fontSize: 12, color: 'var(--text-tertiary)', width: 70, textAlign: 'right' },
  listActions: { display: 'flex', gap: 4, flexShrink: 0 },
  smallBtn: {
    padding: '4px 8px', border: 'none', background: 'rgba(0,0,0,0.06)',
    borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  // Preview
  previewOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  previewContent: {
    position: 'relative', maxWidth: '90vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  previewClose: {
    position: 'absolute', top: -40, right: 0, background: 'none',
    border: 'none', color: 'white', fontSize: 24, cursor: 'pointer',
  },
  previewImg: {
    maxWidth: '90vw', maxHeight: '75vh', borderRadius: 8,
    objectFit: 'contain',
  },
  previewInfo: {
    display: 'flex', gap: 16, alignItems: 'center',
    color: 'white', fontSize: 13,
  },
  // Empty
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, minHeight: 300,
  },
  // Footer
  footer: {
    padding: '8px 20px', textAlign: 'center',
  },
  footerLink: {
    fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none',
  },
};

// CSS hover 효과 주입
const hoverCSS = document.createElement('style');
hoverCSS.textContent = `
  [data-nas-grid] > div:hover { transform: translateY(-2px); box-shadow: var(--shadow-md) !important; }
  [data-nas-grid] > div:hover [style*="opacity: 0"] { opacity: 1 !important; }
  [data-nas-list] > div:hover { background: var(--bg-hover) !important; }
`;
if (!document.getElementById('nas-hover-css')) {
  hoverCSS.id = 'nas-hover-css';
  document.head.appendChild(hoverCSS);
}
