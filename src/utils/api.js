const API_BASE = 'https://st.looool.xyz/api';

// 토큰 관리
export const saveToken = (token) => localStorage.setItem('auth_token', token);
export const getToken = () => localStorage.getItem('auth_token');
export const removeToken = () => localStorage.removeItem('auth_token');
export const isAuthenticated = () => !!getToken();

// 교사 정보 관리
export const saveTeacher = (teacher) => localStorage.setItem('teacher', JSON.stringify(teacher));
export const getTeacher = () => {
  try { return JSON.parse(localStorage.getItem('teacher')); } catch { return null; }
};
export const removeTeacher = () => localStorage.removeItem('teacher');

// 학년도 계산 (3월 기준)
export function currentSchoolYear() {
  const stored = parseInt(localStorage.getItem('classYear'), 10);
  if (stored && !isNaN(stored)) return stored;
  const now = new Date();
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

// API 공통 호출
const apiCall = async (endpoint, options = {}) => {
  const token = getToken();
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };
  const response = await fetch(`${API_BASE}${endpoint}`, config);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '알 수 없는 오류' }));
    throw new Error(error.error || '요청 실패');
  }
  return response.json();
};

// Auth API
export const authAPI = {
  checkSetup: () => apiCall('/auth/check'),
  setup: (data) => apiCall('/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  login: (username, password) => apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => apiCall('/auth/me'),
};

// Teachers API
export const teachersAPI = {
  getAll: () => apiCall('/teachers'),
  create: (teacher) => apiCall('/teachers', { method: 'POST', body: JSON.stringify(teacher) }),
  delete: (id) => apiCall(`/teachers/${id}`, { method: 'DELETE' }),
  changePassword: (data) => apiCall('/teachers/password', { method: 'PUT', body: JSON.stringify(data) }),
};

// Students API
export const studentsAPI = {
  getCount: (year) => apiCall(`/students/count?year=${year || currentSchoolYear()}`),
  getAll: (year, includeInactive = false) => apiCall(`/students?year=${year || currentSchoolYear()}&includeInactive=${includeInactive}`),
  bulkCreate: (students, year) => apiCall('/students/bulk', { method: 'POST', body: JSON.stringify({ students, school_year: year || currentSchoolYear() }) }),
  create: (student, year) => apiCall('/students', { method: 'POST', body: JSON.stringify({ ...student, school_year: year || currentSchoolYear() }) }),
  update: (id, data) => apiCall(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivate: (id) => apiCall(`/students/${id}/deactivate`, { method: 'PATCH' }),
  activate: (id) => apiCall(`/students/${id}/activate`, { method: 'PATCH' }),
  remove: (id, year) => apiCall(`/students/${id}?year=${year || currentSchoolYear()}`, { method: 'DELETE' }),
  delete: (id, year) => apiCall(`/students/${id}?year=${year || currentSchoolYear()}`, { method: 'DELETE' }),
};

// Categories API
export const categoriesAPI = {
  getAll: (year) => apiCall(`/categories?year=${year || currentSchoolYear()}`),
  create: (category, year) => apiCall('/categories', { method: 'POST', body: JSON.stringify({ ...category, school_year: year || currentSchoolYear() }) }),
  update: (id, data) => apiCall(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiCall(`/categories/${id}`, { method: 'DELETE' }),
};

// Evaluations API
export const evaluationsAPI = {
  getByCategory: (categoryId, year) => apiCall(`/evaluations/category/${categoryId}?year=${year || currentSchoolYear()}`),
  getByStudent: (studentId, year) => apiCall(`/evaluations/student/${studentId}?year=${year || currentSchoolYear()}`),
  create: (evaluation, year) => apiCall('/evaluations', { method: 'POST', body: JSON.stringify({ ...evaluation, school_year: year || currentSchoolYear() }) }),
  update: (id, data) => apiCall(`/evaluations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiCall(`/evaluations/${id}`, { method: 'DELETE' }),
  deleteAllByCategory: (categoryId, year) => apiCall(`/evaluations/category/${categoryId}/all?year=${year || currentSchoolYear()}`, { method: 'DELETE' }),
  getGradeSelections: (year) => apiCall(`/grade/selections?year=${year || currentSchoolYear()}`),
  saveGradeSelections: (selections, year) => apiCall('/grade/selections', { method: 'PUT', body: JSON.stringify({ selections, year: year || currentSchoolYear() }) }),
};

// Checklist API
export const checklistAPI = {
  getTopics: (year) => apiCall(`/checklist/topics?year=${year || currentSchoolYear()}`),
  createTopic: (name, year) => apiCall('/checklist/topics', { method: 'POST', body: JSON.stringify({ name, school_year: year || currentSchoolYear() }) }),
  toggleTopic: (id) => apiCall(`/checklist/topics/${id}/toggle`, { method: 'PATCH' }),
  deleteTopic: (id) => apiCall(`/checklist/topics/${id}`, { method: 'DELETE' }),
  getItems: (topicId) => apiCall(`/checklist/topics/${topicId}/items`),
  createItem: (topic_id, item_name) => apiCall('/checklist/items', { method: 'POST', body: JSON.stringify({ topic_id, item_name }) }),
  deleteItem: (id) => apiCall(`/checklist/items/${id}`, { method: 'DELETE' }),
  getChecks: (topicId) => apiCall(`/checklist/checks/${topicId}`),
  toggleCheck: (topic_id, item_id, student_id) => apiCall('/checklist/checks/toggle', { method: 'POST', body: JSON.stringify({ topic_id, item_id, student_id }) }),
};

// Seating API
export const seatingAPI = {
  getArrangements: (year) => apiCall(`/seating/arrangements?year=${year || currentSchoolYear()}`),
  createArrangement: (title, year) => apiCall('/seating/arrangements', { method: 'POST', body: JSON.stringify({ title, school_year: year || currentSchoolYear() }) }),
  getArrangementDetails: (id) => apiCall(`/seating/arrangements/${id}`),
  deleteArrangement: (id) => apiCall(`/seating/arrangements/${id}`, { method: 'DELETE' }),
  savePositions: (arrangementId, positions) => apiCall(`/seating/arrangements/${arrangementId}/positions`, { method: 'PUT', body: JSON.stringify({ positions }) }),
  savePreferences: (arrangementId, preferences) => apiCall(`/seating/arrangements/${arrangementId}/preferences`, { method: 'PUT', body: JSON.stringify(preferences) }),
  getHistory: (studentId) => apiCall(`/seating/history/${studentId}`),
  getHistorySummary: (year) => apiCall(`/seating/history-summary?year=${year || currentSchoolYear()}`),
  aiChat: (data) => apiCall('/seating/ai-chat', { method: 'POST', body: JSON.stringify(data) }),
};

// Attendance API
export const attendanceAPI = {
  getRecords: (year, month) => apiCall(`/attendance/records?year=${year || currentSchoolYear()}${month ? `&month=${month}` : ''}`),
  saveRecord: (studentId, recordDate, attType, year) => apiCall('/attendance/records', {
    method: 'PUT',
    body: JSON.stringify({ records: [{ student_id: studentId, record_date: recordDate, att_type: attType }], year: year || currentSchoolYear() }),
  }),
  getNotes: (year, month) => apiCall(`/attendance/notes?year=${year || currentSchoolYear()}${month ? `&month=${month}` : ''}`),
  saveNote: (studentId, recordDate, note, year) => apiCall('/attendance/notes', {
    method: 'PUT',
    body: JSON.stringify({ student_id: studentId, record_date: recordDate, note, year: year || currentSchoolYear() }),
  }),
  getEvents: (year) => apiCall(`/attendance/events?year=${year || currentSchoolYear()}`),
  saveEvents: (events, year) => apiCall('/attendance/events', { method: 'PUT', body: JSON.stringify({ events, year: year || currentSchoolYear() }) }),
  getSemester: (year) => apiCall(`/attendance/semester?year=${year || currentSchoolYear()}`),
  saveSemester: (data, year) => apiCall('/attendance/semester', { method: 'PUT', body: JSON.stringify({ ...data, year: year || currentSchoolYear() }) }),
};

// Behavior API
export const behaviorAPI = {
  getLogs: (year, studentId) => apiCall(`/behavior/logs?year=${year || currentSchoolYear()}${studentId ? `&studentId=${studentId}` : ''}`),
  createLog: (data, year) => apiCall('/behavior/logs', { method: 'POST', body: JSON.stringify({ ...data, year: year || currentSchoolYear() }) }),
  updateLog: (id, content) => apiCall(`/behavior/logs/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteLog: (id) => apiCall(`/behavior/logs/${id}`, { method: 'DELETE' }),
  getChecklist: (studentId, year) => apiCall(`/behavior/checklist/${studentId}?year=${year || currentSchoolYear()}`),
  saveChecklist: (studentId, data, year) => apiCall(`/behavior/checklist/${studentId}`, { method: 'PUT', body: JSON.stringify({ ...data, year: year || currentSchoolYear() }) }),
};

// Grade API
export const gradeAPI = {
  getResults: (year) => apiCall(`/grade/results?year=${year || currentSchoolYear()}`),
  updateResult: (id, generated_text) => apiCall(`/grade/results/${id}`, { method: 'PUT', body: JSON.stringify({ generated_text }) }),
  generate: (data) => apiCall('/grade/generate', { method: 'POST', body: JSON.stringify({ ...data, year: data.year || currentSchoolYear() }) }),
};

// Album API
export const albumAPI = {
  list: () => apiCall('/album'),
  upload: async (file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('photo', file);
    const response = await fetch(`${API_BASE}/album/upload`, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: formData,
    });
    if (!response.ok) throw new Error('업로드 실패');
    return response.json();
  },
  delete: (filename) => apiCall(`/album/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
};

// Presentations API
export const presentationAPI = {
  getDaily: (date) => apiCall(`/presentations/daily?date=${date || new Date().toISOString().split('T')[0]}`),
  increment: (studentId, date, arrangementId) => apiCall('/presentations/increment', { method: 'POST', body: JSON.stringify({ student_id: studentId, date, arrangement_id: arrangementId }) }),
  decrement: (studentId, date) => apiCall('/presentations/decrement', { method: 'POST', body: JSON.stringify({ student_id: studentId, date }) }),
  toggleSpecial: (studentId, date, arrangementId) => apiCall('/presentations/toggle-special', { method: 'POST', body: JSON.stringify({ student_id: studentId, date, arrangement_id: arrangementId }) }),
  saveDaily: (entries) => apiCall('/presentations/daily', { method: 'PUT', body: JSON.stringify({ entries }) }),
  getWeekly: () => apiCall('/presentations/weekly'),
  getStats: () => apiCall('/presentations/stats'),
};
