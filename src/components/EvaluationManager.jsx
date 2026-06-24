import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { evaluationsAPI, categoriesAPI } from '../utils/api';
import StudentDetail from './StudentDetail';
import './EvaluationManager.css';

const FORCE_STYLE = document.createElement('style');
FORCE_STYLE.textContent = `
  .dashboard-main, .dashboard-main * { color: #3A3A4A; }
  .evaluation-table tbody td { color: #3A3A4A !important; background-color: #fff !important; }
  .evaluation-table tbody tr:hover td { background-color: #EBF4F8 !important; }
  .td-sticky { background-color: #fff !important; color: #3A3A4A !important; }
  .student-name-cell { color: #3A3A4A !important; }
  .average-cell { color: #5A6DB0 !important; background-color: #EBF4F8 !important; }
  .score-badge { color: #7B6BB0 !important; }
  .thead-title-row th { background-color: #5A6DB0 !important; color: #fff !important; }
  .thead-date-row th { background-color: #7BA7BC !important; color: #fff !important; }
  .th-sticky { background-color: #5A6DB0 !important; color: #fff !important; }
`;
document.head.appendChild(FORCE_STYLE);

// 날짜 포맷: MM/DD
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const str = typeof dateStr === 'string' ? dateStr : String(dateStr);
  const parts = str.substring(0, 10).split('-');
  if (parts.length < 3) return str;
  return `${parts[1]}/${parts[2]}`;
};

// 날짜+제목으로 컬럼 키 생성
const getColKey = (date, title) => `${date}__${title || ''}`;

function EvaluationManager({ students, categories, onCategoryUpdate }) {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [columns, setColumns] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [showDateModal, setShowDateModal] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newTitle, setNewTitle] = useState('');

  const [selectedGradeCols, setSelectedGradeCols] = useState({}); // { colKey: boolean }

  useEffect(() => {
    if (categoryId) loadCategoryData();
  }, [categoryId]);

  // 성적처리 선택 상태 로드
  useEffect(() => {
    if (!categoryId) return;
    evaluationsAPI.getGradeSelections().then(sels => {
      if (!Array.isArray(sels)) return;
      const cat = categories.find(c => c.id === parseInt(categoryId));
      if (!cat) return;
      const map = {};
      sels.filter(s => s.category_id === parseInt(categoryId) && s.is_selected)
          .forEach(s => { map[`${s.evaluation_date}_${s.title}`] = true; });
      setSelectedGradeCols(map);
    }).catch(() => {});
  }, [categoryId]);

  const loadCategoryData = async () => {
    setLoading(true);
    try {
      const cat = categories.find(c => c.id === parseInt(categoryId));
      setCategory(cat);

      const evals = await evaluationsAPI.getByCategory(categoryId);
      setEvaluations(evals);

      // 날짜+제목 조합으로 컬럼 구성 (최신순)
      const colMap = {};
      evals.forEach(e => {
        const dateStr = String(e.evaluation_date).substring(0, 10);
        const key = getColKey(dateStr, e.title);
        if (!colMap[key]) {
          colMap[key] = { date: dateStr, title: e.title || '', key };
        }
      });

      const sorted = Object.values(colMap).sort((a, b) =>
        new Date(b.date) - new Date(a.date)
      );
      setColumns(sorted);
    } catch (error) {
      console.error('평가 데이터 로드 실패:', error);
      alert('평가 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 특정 학생 + 컬럼(날짜+제목)의 점수 목록
  const getScores = (studentId, col) => {
    return evaluations.filter(
      e => e.student_id === studentId &&
        String(e.evaluation_date).substring(0, 10) === String(col.date).substring(0, 10) &&
        (e.title || '') === col.title
    );
  };

  const getAverage = (studentId) => {
    const evs = evaluations.filter(e => e.student_id === studentId);
    if (evs.length === 0) return null;
    const sum = evs.reduce((acc, e) => acc + parseFloat(e.score), 0);
    return (sum / evs.length).toFixed(1);
  };

  const getMinMax = (studentId) => {
    const evs = evaluations.filter(e => e.student_id === studentId);
    if (evs.length === 0) return { min: null, max: null };
    const scores = evs.map(e => parseFloat(e.score));
    return { min: Math.min(...scores), max: Math.max(...scores) };
  };

  // 새 컬럼 추가
  const handleAddColumn = () => {
    if (!newDate) return;
    const key = getColKey(newDate, newTitle);
    if (!columns.find(c => c.key === key)) {
      const newCol = { date: newDate, title: newTitle.trim(), key };
      const newCols = [newCol, ...columns].sort((a, b) => new Date(b.date) - new Date(a.date));
      setColumns(newCols);
    }
    setShowDateModal(false);
    setNewTitle('');
  };

  const handleCellClick = (studentId, col, existingRecord = null) => {
    setEditingCell({ studentId, col, recordId: existingRecord?.id || null });
    setInputValue(existingRecord ? String(existingRecord.score) : '');
  };

  const handleSaveScore = async () => {
    if (!editingCell) return;
    const { studentId, col, recordId } = editingCell;

    if (inputValue === '' || inputValue === null) {
      setEditingCell(null);
      setInputValue('');
      return;
    }

    const score = parseFloat(inputValue);
    if (isNaN(score) || score < 0 || score > category.max_score) {
      alert(`점수는 0에서 ${category.max_score} 사이여야 합니다.`);
      return;
    }

    try {
      if (recordId) {
        await evaluationsAPI.update(recordId, {
          score,
          evaluation_date: col.date,
          title: col.title
        });
        // 전체 리로드 대신 해당 레코드만 로컬에서 갱신
        setEvaluations(prev => prev.map(e =>
          e.id === recordId
            ? { ...e, score, evaluation_date: col.date, title: col.title }
            : e
        ));
      } else {
        const created = await evaluationsAPI.create({
          student_id: studentId,
          category_id: parseInt(categoryId),
          score,
          evaluation_date: col.date,
          title: col.title
        });
        if (created && created.id != null) {
          // 서버가 돌려준 새 레코드를 로컬에 추가
          setEvaluations(prev => [...prev, {
            id: created.id,
            student_id: studentId,
            category_id: parseInt(categoryId),
            score,
            evaluation_date: col.date,
            title: col.title,
          }]);
        } else {
          // 서버가 새 id를 안 주면 안전하게 1회만 동기화
          await loadCategoryData();
        }
      }
      setEditingCell(null);
      setInputValue('');
    } catch (error) {
      alert(error.message || '점수 저장에 실패했습니다.');
    }
  };

  const handleDeleteScore = async (recordId, e) => {
    e.stopPropagation();
    if (!confirm('이 점수를 삭제하시겠습니까?')) return;
    try {
      await evaluationsAPI.delete(recordId);
      // 전체 리로드 대신 해당 레코드만 로컬에서 제거
      setEvaluations(prev => prev.filter(ev => ev.id !== recordId));
    } catch (error) {
      alert(error.message || '점수 삭제에 실패했습니다.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveScore();
    else if (e.key === 'Escape') {
      setEditingCell(null);
      setInputValue('');
    }
  };

  const toggleGradeCol = async (col) => {
    const key = `${col.date}_${col.title}`;
    const newVal = !selectedGradeCols[key];
    setSelectedGradeCols(prev => ({ ...prev, [key]: newVal }));
    try {
      await evaluationsAPI.saveGradeSelections([{
        category_id: parseInt(categoryId),
        evaluation_date: col.date,
        title: col.title,
        is_selected: newVal,
      }]);
    } catch (e) { console.error('성적 선택 저장 실패:', e); }
  };

  const handleDeleteCategory = async () => {
    if (!confirm(`'${category.name}' 카테고리를 삭제하시겠습니까?\n평가 기록이 있으면 삭제할 수 없습니다.`)) return;
    try {
      await categoriesAPI.delete(categoryId);
      onCategoryUpdate();
      window.location.href = '/';
    } catch (error) {
      alert(error.message || '카테고리 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="evaluation-loading">
        <div className="spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!category) {
    return <div className="evaluation-error"><p>카테고리를 찾을 수 없습니다.</p></div>;
  }

  return (
    <div className="evaluation-manager">
      <div className="evaluation-header">
        <div>
          <h2>{category.name}</h2>
          <p className="category-info">만점: {category.max_score}점</p>
        </div>
        <div className="evaluation-actions">
          <button className="btn btn-primary" onClick={() => {
            setNewDate(new Date().toISOString().split('T')[0]);
            setNewTitle('');
            setShowDateModal(true);
          }}>
            + 새 평가 추가
          </button>
          <button className="btn btn-danger" onClick={handleDeleteCategory}>
            카테고리 삭제
          </button>
        </div>
      </div>

      <div className="evaluation-table-container">
        <table className="evaluation-table">
          <thead>
            {/* 첫 번째 행: 평가 제목 */}
            <tr className="thead-title-row">
              <th className="th-sticky th-name"></th>
              <th className="th-sticky th-avg"></th>
              {columns.map(col => (
                <th key={col.key} className="th-title">
                  {col.title || <span className="no-title">제목없음</span>}
                </th>
              ))}
            </tr>
            {/* 두 번째 행: 날짜 + 성적처리 체크 */}
            <tr className="thead-date-row">
              <th className="th-sticky th-name">이름</th>
              <th className="th-sticky th-avg">평균</th>
              {columns.map(col => (
                <th key={col.key} className="th-date">
                  <div>{formatDate(col.date)}</div>
                  <div
                    title="성적처리에 사용"
                    style={{ marginTop: '2px', cursor: 'pointer', fontSize: '11px', opacity: selectedGradeCols[`${col.date}_${col.title}`] ? 1 : 0.4 }}
                    onClick={() => toggleGradeCol(col)}
                  >
                    {selectedGradeCols[`${col.date}_${col.title}`] ? '✅' : '⬜'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map(student => {
              const avg = getAverage(student.id);
              const { min, max } = getMinMax(student.id);

              return (
                <tr key={student.id}>
                  <td
                    className="td-sticky student-name-cell"
                    onClick={() => setSelectedStudent(student)}
                  >
                    {student.student_number}. {student.name}
                  </td>
                  <td className="td-sticky average-cell">{avg || '-'}</td>
                  {columns.map(col => {
                    const scoreList = getScores(student.id, col);
                    const isEditingNew = editingCell?.studentId === student.id &&
                      editingCell?.col?.key === col.key &&
                      editingCell?.recordId === null;

                    return (
                      <td key={col.key} className="score-cell">
                        {scoreList.map(record => {
                          const score = parseFloat(record.score);
                          const isEditingThis = editingCell?.recordId === record.id;
                          let scoreClass = 'score-badge';
                          if (score === max && max !== min) scoreClass += ' max-score';
                          if (score === min && max !== min) scoreClass += ' min-score';

                          return isEditingThis ? (
                            <input
                              key={record.id}
                              type="number"
                              className="score-input"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleSaveScore}
                              autoFocus
                              min="0"
                              max={category.max_score}
                              step="0.1"
                            />
                          ) : (
                            <span
                              key={record.id}
                              className={scoreClass}
                              onClick={() => handleCellClick(student.id, col, record)}
                            >
                              {score}
                              <button
                                className="score-delete-btn"
                                onClick={(e) => handleDeleteScore(record.id, e)}
                                title="삭제"
                              >×</button>
                            </span>
                          );
                        })}

                        {isEditingNew ? (
                          <input
                            type="number"
                            className="score-input"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveScore}
                            autoFocus
                            min="0"
                            max={category.max_score}
                            step="0.1"
                          />
                        ) : (
                          <button
                            className="score-add-btn"
                            onClick={() => handleCellClick(student.id, col, null)}
                            title="점수 추가"
                          >+</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedStudent && (
        <StudentDetail
          student={selectedStudent}
          categories={categories}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* 날짜+제목 추가 모달 */}
      {showDateModal && (
        <div className="modal-overlay" onClick={() => setShowDateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>새 평가 추가</h3>
              <button className="modal-close" onClick={() => setShowDateModal(false)}>×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="label">평가 내용</label>
                <input
                  type="text"
                  className="input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 3단원 나눗셈, 1회차, 2주차..."
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="label">날짜</label>
                <input
                  type="date"
                  className="input"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
                <p className="hint">과거 날짜도 선택 가능합니다</p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowDateModal(false)}>취소</button>
                <button className="btn btn-primary" onClick={handleAddColumn}>추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EvaluationManager;
