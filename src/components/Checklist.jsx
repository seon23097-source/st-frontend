import React, { useState, useEffect } from 'react';
import { checklistAPI, studentsAPI } from '../utils/api';
import './Checklist.css';

function Checklist() {
  const [topics, setTopics] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [topicsData, studentsData] = await Promise.all([
        checklistAPI.getTopics(),
        studentsAPI.getAll()
      ]);
      setTopics(topicsData);
      setStudents(studentsData);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTopicDetails = async (topicId) => {
    try {
      const [itemsData, checksData] = await Promise.all([
        checklistAPI.getItems(topicId),
        checklistAPI.getChecks(topicId)
      ]);
      setItems(itemsData);
      setChecks(checksData);
    } catch (error) {
      console.error('주제 상세 로드 실패:', error);
    }
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    try {
      await checklistAPI.createTopic(newTopicName);
      setNewTopicName('');
      setShowTopicModal(false);
      await loadData();
    } catch (error) {
      alert('주제 생성 실패: ' + error.message);
    }
  };

  const handleToggleTopic = async (topicId) => {
    try {
      await checklistAPI.toggleTopic(topicId);
      await loadData();
    } catch (error) {
      alert('상태 변경 실패: ' + error.message);
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!confirm('이 주제를 삭제하시겠습니까? 모든 항목과 체크 기록이 함께 삭제됩니다.')) return;
    
    try {
      await checklistAPI.deleteTopic(topicId);
      if (selectedTopic?.id === topicId) {
        setSelectedTopic(null);
        setItems([]);
        setChecks([]);
      }
      await loadData();
    } catch (error) {
      alert('삭제 실패: ' + error.message);
    }
  };

  const handleSelectTopic = async (topic) => {
    setSelectedTopic(topic);
    await loadTopicDetails(topic.id);
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !selectedTopic) return;

    try {
      await checklistAPI.createItem(selectedTopic.id, newItemName);
      setNewItemName('');
      setShowItemModal(false);
      await loadTopicDetails(selectedTopic.id);
    } catch (error) {
      alert('항목 추가 실패: ' + error.message);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    
    try {
      await checklistAPI.deleteItem(itemId);
      await loadTopicDetails(selectedTopic.id);
    } catch (error) {
      alert('삭제 실패: ' + error.message);
    }
  };

  const handleToggleCheck = async (itemId, studentId) => {
    try {
      await checklistAPI.toggleCheck(selectedTopic.id, itemId, studentId);
      await loadTopicDetails(selectedTopic.id);
    } catch (error) {
      alert('체크 실패: ' + error.message);
    }
  };

  const isChecked = (itemId, studentId) => {
    const check = checks.find(c => c.item_id === itemId && c.student_id === studentId);
    return check?.is_checked || false;
  };

  const activeTopics = topics.filter(t => t.is_active);
  const inactiveTopics = topics.filter(t => !t.is_active);

  if (loading) {
    return (
      <div className="checklist-loading">
        <div className="spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="checklist-container">
      {/* 왼쪽: 주제 목록 */}
      <aside className="checklist-sidebar">
        <div className="checklist-sidebar-header">
          <h2>체크리스트 주제</h2>
          <button className="btn-icon" onClick={() => setShowTopicModal(true)} title="새 주제">+</button>
        </div>

        {/* 수합 중 (활성 주제) */}
        <div className="checklist-section">
          <h3 className="checklist-section-title">📌 수합 중</h3>
          <div className="checklist-topics-scroll active-topics">
            {activeTopics.length === 0 ? (
              <div className="empty-state">
                <p>수합 중인 주제가 없습니다</p>
              </div>
            ) : (
              activeTopics.map(topic => (
                <div
                  key={topic.id}
                  className={`checklist-topic-item ${selectedTopic?.id === topic.id ? 'selected' : ''}`}
                  onClick={() => handleSelectTopic(topic)}
                >
                  <span className="topic-name">{topic.name}</span>
                  <div className="topic-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-topic-action btn-complete"
                      onClick={() => handleToggleTopic(topic.id)}
                      title="수합 완료"
                    >✓</button>
                    <button
                      className="btn-topic-action btn-delete"
                      onClick={() => handleDeleteTopic(topic.id)}
                      title="삭제"
                    >×</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 수합 완료 (비활성 주제) */}
        <div className="checklist-section">
          <h3 className="checklist-section-title">✅ 수합 완료</h3>
          <div className="checklist-topics-scroll inactive-topics">
            {inactiveTopics.length === 0 ? (
              <div className="empty-state">
                <p>완료된 주제가 없습니다</p>
              </div>
            ) : (
              inactiveTopics.map(topic => (
                <div
                  key={topic.id}
                  className={`checklist-topic-item inactive ${selectedTopic?.id === topic.id ? 'selected' : ''}`}
                  onClick={() => handleSelectTopic(topic)}
                >
                  <span className="topic-name">{topic.name}</span>
                  <div className="topic-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-topic-action btn-reactivate"
                      onClick={() => handleToggleTopic(topic.id)}
                      title="다시 수합"
                    >↺</button>
                    <button
                      className="btn-topic-action btn-delete"
                      onClick={() => handleDeleteTopic(topic.id)}
                      title="삭제"
                    >×</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* 오른쪽: 체크리스트 테이블 */}
      <main className="checklist-main">
        {!selectedTopic ? (
          <div className="checklist-empty">
            <h2>✅ 체크리스트</h2>
            <p>왼쪽에서 주제를 선택하거나 새로 만들어보세요.</p>
          </div>
        ) : (
          <>
            <div className="checklist-header">
              <h2>{selectedTopic.name}</h2>
              <button className="btn btn-primary" onClick={() => setShowItemModal(true)}>
                + 수합내용 추가
              </button>
            </div>

            {items.length === 0 ? (
              <div className="checklist-empty">
                <p>수합내용을 추가해주세요.</p>
                <button className="btn btn-primary" onClick={() => setShowItemModal(true)}>
                  + 첫 수합내용 추가
                </button>
              </div>
            ) : (
              <div className="checklist-table-wrapper">
                <table className="checklist-table">
                  <thead>
                    <tr>
                      <th className="student-col">학생</th>
                      {items.map(item => (
                        <th key={item.id} className="item-col">
                          <div className="item-header">
                            <span>{item.item_name}</span>
                            <button
                              className="btn-delete-item"
                              onClick={() => handleDeleteItem(item.id)}
                              title="삭제"
                            >×</button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(student => (
                      <tr key={student.id}>
                        <td className="student-name">{student.name}</td>
                        {items.map(item => (
                          <td
                            key={`${student.id}-${item.id}`}
                            className={`check-cell ${isChecked(item.id, student.id) ? 'checked' : ''}`}
                            onClick={() => handleToggleCheck(item.id, student.id)}
                          >
                            {isChecked(item.id, student.id) ? '✓' : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* 주제 생성 모달 */}
      {showTopicModal && (
        <div className="modal-overlay" onClick={() => setShowTopicModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>새 체크리스트 주제</h3>
              <button className="modal-close" onClick={() => setShowTopicModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateTopic} className="modal-form">
              <div className="form-group">
                <label className="label">주제 이름</label>
                <input
                  type="text"
                  className="input"
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value)}
                  placeholder="예: 숙제, 준비물, 독서록"
                  autoFocus
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowTopicModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">생성</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 항목 추가 모달 */}
      {showItemModal && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>수합내용 추가</h3>
              <button className="modal-close" onClick={() => setShowItemModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateItem} className="modal-form">
              <div className="form-group">
                <label className="label">수합내용</label>
                <input
                  type="text"
                  className="input"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="예: 국어책, 색연필, 실내화"
                  autoFocus
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowItemModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checklist;
