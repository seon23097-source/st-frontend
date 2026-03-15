import React, { useState, useEffect } from 'react';
import { studentsAPI } from '../utils/api';
import './InitialSetup.css';

function InitialSetup({ onComplete }) {
  const [studentCount, setStudentCount] = useState(30);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingStudents, setHasExistingStudents] = useState(false);

  useEffect(() => {
    checkExistingStudents();
  }, []);

  const checkExistingStudents = async () => {
    try {
      const { count } = await studentsAPI.getCount();
      if (count > 0) {
        setHasExistingStudents(true);
        // 기존 학생이 있으면 바로 완료 처리
        onComplete();
      } else {
        // 학생 목록 초기화
        initializeStudents(studentCount);
      }
    } catch (err) {
      console.error('학생 수 확인 오류:', err);
    }
  };

  const initializeStudents = (count) => {
    const newStudents = Array.from({ length: count }, (_, i) => ({
      student_number: i + 1,
      name: '',
    }));
    setStudents(newStudents);
  };

  const handleCountChange = (e) => {
    const count = parseInt(e.target.value) || 0;
    setStudentCount(count);
    if (count > 0) {
      initializeStudents(count);
    }
  };

  const handleNameChange = (index, name) => {
    const newStudents = [...students];
    newStudents[index].name = name;
    setStudents(newStudents);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // 이름이 입력되지 않은 학생 확인
    const emptyNames = students.filter(s => !s.name.trim());
    if (emptyNames.length > 0) {
      setError('모든 학생의 이름을 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      await studentsAPI.bulkCreate(students);
      alert('학생 명단이 등록되었습니다!');
      onComplete();
    } catch (err) {
      setError(err.message || '학생 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (hasExistingStudents) {
    return null;
  }

  return (
    <div className="initial-setup-container">
      <div className="initial-setup-content">
        <div className="initial-setup-header fade-in">
          <h1>학급 초기 설정</h1>
          <p>학생 수를 입력하고 명단을 작성해주세요</p>
        </div>

        <div className="setup-card-white fade-in">
          <div className="student-count-section">
            <label className="label">학생 수</label>
            <input
              type="number"
              className="input"
              value={studentCount}
              onChange={handleCountChange}
              min="1"
              max="50"
              placeholder="학생 수를 입력하세요"
            />
            <p className="hint">학생 수를 변경하면 아래 명단이 초기화됩니다</p>
          </div>

          {students.length > 0 && (
            <form onSubmit={handleSubmit} className="students-form">
              <div className="students-grid">
                {students.map((student, index) => (
                  <div key={index} className="student-input-row">
                    <div className="student-number">
                      {student.student_number}번
                    </div>
                    <input
                      type="text"
                      className="input"
                      value={student.name}
                      onChange={(e) => handleNameChange(index, e.target.value)}
                      placeholder="이름"
                      required
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary btn-large"
                disabled={loading}
              >
                {loading ? '등록 중...' : '학생 명단 등록'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default InitialSetup;
