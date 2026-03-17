import React from 'react';

const NEXTCLOUD_URL = 'https://nas.looool.xyz';

export default function Album() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <div style={{
        background: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
        padding: '16px 24px', borderLeft: '5px solid var(--primary)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--primary-dark)' }}>NAS 앨범</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Nextcloud에서 사진을 관리하세요</p>
        </div>
        <a href={NEXTCLOUD_URL} target="_blank" rel="noreferrer" className="btn btn-primary">
          Nextcloud 열기 →
        </a>
      </div>

      <div style={{
        flex: 1, background: 'white', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: '20px',
      }}>
        <div style={{ fontSize: '64px' }}>☁️</div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Nextcloud NAS
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
            사진은 Nextcloud에서 직접 업로드·관리합니다.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
            {NEXTCLOUD_URL}
          </p>
        </div>
        <a href={NEXTCLOUD_URL} target="_blank" rel="noreferrer" className="btn btn-outline">
          Nextcloud 바로가기
        </a>
      </div>
    </div>
  );
}
