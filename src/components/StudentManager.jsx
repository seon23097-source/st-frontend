import React, { useState, useEffect } from 'react';
import { studentsAPI } from '../utils/api';
import './StudentManager.css';

function StudentManager({ students, onUpdate, classYear }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudent, setNewStudent] = useState({ student_number: '', name: '' });
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [inactiveStudents, setInactiveStudents] = useState([]);

  // 페이지 열리면 전출 학생도 바로 불러오기
  useEffect(() => {
    loadInactiveStudents();
  }, []);

  const loadInactiveStudents = async () => {
    try {
      const all = await studentsAPI.getAll(classYear, true);
      setInactiveStudents(all.filter(s => !s.is_active));
    } catch (error) {
      console.error('전출 학생 불러오기 실패');
    }
  };

  // 학생 추가
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newStudent.name.trim()) { alert('이름을 입력해주세요.'); return; }
    if (!newStudent.student_number) { alert('번호를 입력해주세요.'); return; }
    try {
      await studentsAPI.create({
        student_number: parseInt(newStudent.student_number),
        name: newStudent.name.trim()
      }, classYear);
      setNewStudent({ student_number: '', name: '' });
      setShowAddModal(false);
      onUpdate();
    } catch (error) {
      alert(error.message || '학생 추가 실패');
    }
  };

  // 이름 수정
  const handleEditSave = async (id) => {
    if (!editingName.trim()) return;
    try {
      await studentsAPI.update(id, { name: editingName.trim() });
      setEditingId(null);
      onUpdate();
    } catch (error) {
      alert(error.message || '수정 실패');
    }
  };

  // 전출 처리
  const handleDeactivate = async (student) => {
    if (!confirm(`${student.name} 학생을 전출 처리하시겠습니까?\n평가 기록은 보존되며 아래 전출 목록에서 복구할 수 있습니다.`)) return;
    try {
      await studentsAPI.deactivate(student.id);
      await loadInactiveStudents(); // 전출 목록 즉시 갱신
      onUpdate();
    } catch (error) {
      alert(error.message || '전출 처리 실패');
    }
  };

  // 전입 복귀
  const handleActivate = async (student) => {
    if (!confirm(`${student.name} 학생을 재학생으로 복구하시겠습니까?`)) return;
    try {
      await studentsAPI.activate(student.id);
      await loadInactiveStudents();
      onUpdate();
    } catch (error) {
      alert(error.message || '복구 실패');
    }
  };

  return (
    <div className="student-manager fade-in">
      <div className="student-manager-header">
        <div>
          <h2>학생 관리</h2>
          <p className="student-count-info">재학생 {students.length}명</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + 전입 학생 추가
        </button>
      </div>

      {/* 재학생 목록 */}
      <div className="student-section">
        <div className="section-label active-label">재학생</div>
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr>
                <th>번호</th>
                <th>이름</th>
                <th>등록일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id}>
                  <td className="td-number">{student.student_number}</td>
                  <td className="td-name">
                    {editingId === student.id ? (
                      <div className="edit-name-row">
                        <input
                          className="input"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleEditSave(student.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-xs" onClick={() => handleEditSave(student.id)}>저장</button>
                        <button className="btn btn-outline btn-xs" onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    ) : (
                      <span>{student.name}</span>
                    )}
                  </td>
                  <td className="td-date">{String(student.created_at).substring(0, 10)}</td>
                  <td className="td-actions">
                    <button className="btn-text btn-edit" onClick={() => {
                      setEditingId(student.id);
                      setEditingName(student.name);
                    }}>수정</button>
                    <button className="btn-text btn-deactivate" onClick={() => handleDeactivate(student)}>
                      전출
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 전출 학생 목록 - 항상 표시 */}
      <div className="student-section">
        <div className="section-label inactive-label">
          전출 학생 {inactiveStudents.length > 0 && <span className="inactive-count">{inactiveStudents.length}명</span>}
        </div>

        {inactiveStudents.length === 0 ? (
          <div className="empty-inactive">전출 학생이 없습니다.</div>
        ) : (
          <div className="student-table-wrap">
            <table className="student-table">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>이름</th>
                  <th>전출일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {inactiveStudents.map(student => (
                  <tr key={student.id} className="inactive-row">
                    <td className="td-number">{student.student_number}</td>
                    <td className="td-name">{student.name}</td>
                    <td className="td-date">
                      {student.deactivated_at ? String(student.deactivated_at).substring(0, 10) : '-'}
                    </td>
                    <td className="td-actions">
                      <button className="btn-text btn-activate" onClick={() => handleActivate(student)}>
                        복구
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 학생 추가 모달 */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>전입 학생 추가</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAdd} className="modal-form">
              <div className="form-group">
                <label className="label">번호</label>
                <input
                  type="number"
                  className="input"
                  value={newStudent.student_number}
                  onChange={e => setNewStudent({ ...newStudent, student_number: e.target.value })}
                  placeholder="예: 31"
                  min="1"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="label">이름</label>
                <input
                  type="text"
                  className="input"
                  value={newStudent.name}
                  onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="학생 이름"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudentManager;
