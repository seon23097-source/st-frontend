import React, { useState, useEffect, useCallback } from 'react';
import { groupsAPI } from '../utils/api';
import './GroupsModal.css';

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#A78BFA',
  '#FF8C42', '#5DADE2', '#F06292', '#26A69A', '#FFA726',
];

export default function GroupsModal({ arrangement, students, onClose, onChanged }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, color, name, student_ids}
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!arrangement) return;
    setLoading(true);
    try {
      const data = await groupsAPI.list(arrangement.id);
      setGroups(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [arrangement]);

  useEffect(() => { reload(); }, [reload]);

  // 이미 다른 모둠에 속한 학생 ID 집합 (현재 편집 중인 모둠은 제외)
  const assignedElsewhere = new Set();
  groups.forEach((g) => {
    if (editing?.id && g.id === editing.id) return;
    g.members.forEach((m) => assignedElsewhere.add(m.student_id));
  });

  const startCreate = () => {
    const nextNo = (groups[groups.length - 1]?.group_no || 0) + 1;
    setEditing({
      id: null,
      color: PRESET_COLORS[(nextNo - 1) % PRESET_COLORS.length],
      name: `${nextNo}모둠`,
      student_ids: [],
    });
  };

  const startEdit = (g) => {
    setEditing({
      id: g.id,
      color: g.color,
      name: g.name || `${g.group_no}모둠`,
      student_ids: g.members.map((m) => m.student_id),
    });
  };

  const toggleStudent = (sid) => {
    setEditing((prev) => {
      const set = new Set(prev.student_ids);
      if (set.has(sid)) set.delete(sid); else set.add(sid);
      return { ...prev, student_ids: Array.from(set) };
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        await groupsAPI.update(editing.id, {
          color: editing.color,
          name: editing.name,
          student_ids: editing.student_ids,
        });
      } else {
        await groupsAPI.create(arrangement.id, {
          color: editing.color,
          name: editing.name,
          student_ids: editing.student_ids,
        });
      }
      setEditing(null);
      await reload();
      onChanged && onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (gid) => {
    if (!window.confirm('이 모둠을 삭제하시겠습니까?')) return;
    try {
      await groupsAPI.remove(gid);
      await reload();
      onChanged && onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="gm-overlay" onClick={onClose}>
      <div className="gm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gm-header">
          <h2>🌱 모둠 관리</h2>
          <button className="gm-close" onClick={onClose}>×</button>
        </div>

        {error && <div className="gm-error">⚠ {error}</div>}

        <div className="gm-body">
          {/* 좌: 모둠 목록 */}
          <div className="gm-list">
            <div className="gm-list-header">
              <span>모둠 목록 ({groups.length})</span>
              <button className="gm-btn gm-btn-primary" onClick={startCreate}>+ 새 모둠</button>
            </div>
            {loading ? (
              <div className="gm-empty">로딩 중...</div>
            ) : groups.length === 0 ? (
              <div className="gm-empty">아직 모둠이 없습니다.<br/>+ 새 모둠을 눌러 만들어보세요.</div>
            ) : (
              groups.map((g) => (
                <div key={g.id} className={`gm-group-card ${editing?.id === g.id ? 'gm-active' : ''}`}>
                  <div className="gm-group-head">
                    <span className="gm-color-dot" style={{ background: g.color }} />
                    <span className="gm-group-name">{g.name || `${g.group_no}모둠`}</span>
                    <span className="gm-group-count">{g.members.length}명</span>
                  </div>
                  <div className="gm-group-members">
                    {g.members.length === 0 ? (
                      <span className="gm-no-member">학생 없음</span>
                    ) : g.members.map((m) => (
                      <span key={m.student_id} className="gm-member-tag">{m.name}</span>
                    ))}
                  </div>
                  <div className="gm-group-actions">
                    <button className="gm-btn gm-btn-small" onClick={() => startEdit(g)}>편집</button>
                    <button className="gm-btn gm-btn-small gm-btn-danger" onClick={() => handleDelete(g.id)}>삭제</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 우: 편집 패널 */}
          <div className="gm-editor">
            {!editing ? (
              <div className="gm-editor-empty">
                <div className="gm-editor-icon">🌱</div>
                <p>왼쪽에서 모둠을 선택하거나<br/>새 모둠을 만들어 학생을 배정하세요.</p>
              </div>
            ) : (
              <>
                <h3>{editing.id ? '모둠 편집' : '새 모둠'}</h3>

                <label className="gm-label">모둠 이름</label>
                <input
                  className="gm-input"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="예: 1모둠, 햇살모둠"
                />

                <label className="gm-label">색상</label>
                <div className="gm-colors">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`gm-color-btn ${editing.color === c ? 'gm-color-selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setEditing({ ...editing, color: c })}
                      type="button"
                      aria-label={c}
                    />
                  ))}
                </div>

                <label className="gm-label">학생 ({editing.student_ids.length}명 선택됨)</label>
                <div className="gm-students">
                  {students.map((s) => {
                    const selected = editing.student_ids.includes(s.id);
                    const taken = assignedElsewhere.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`gm-student-chip ${selected ? 'gm-chip-selected' : ''} ${taken && !selected ? 'gm-chip-taken' : ''}`}
                        onClick={() => toggleStudent(s.id)}
                        title={taken && !selected ? '다른 모둠에 속해 있음 (선택 시 옮겨짐)' : ''}
                      >
                        {selected && '✓ '}{s.name}
                        {taken && !selected && <span className="gm-taken-mark"> ⤴</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="gm-editor-actions">
                  <button className="gm-btn" onClick={() => setEditing(null)}>취소</button>
                  <button className="gm-btn gm-btn-primary" onClick={handleSave}>저장</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
