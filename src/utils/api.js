import axios from 'axios';

const API_BASE = 'https://st.looool.xyz/api';

// ── 토큰 관리 ─────────────────────────────────────────────
export const saveToken    = (token)  => localStorage.setItem('auth_token', token);
export const getToken     = ()       => localStorage.getItem('auth_token');
export const removeToken  = ()       => localStorage.removeItem('auth_token');
export const isAuthenticated = ()    => !!getToken();

// ── 교사 정보 관리 ─────────────────────────────────────────
export const saveTeacher  = (t) => localStorage.setItem('teacher', JSON.stringify(t));
export const getTeacher   = () => { try { return JSON.parse(localStorage.getItem('teacher') || 'null'); } catch { return null; } };
export const removeTeacher = ()  => localStorage.removeItem('teacher');

// ── 학년도 계산 (3월 기준) ─────────────────────────────────
export function currentSchoolYear() {
  const stored = parseInt(localStorage.getItem('classYear') || '', 10);
  if (stored && !isNaN(stored)) return stored;
  const now = new Date();
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── axios 인스턴스 ─────────────────────────────────────────
const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res.data,
  err => Promise.reject(new Error(err.response?.data?.error || err.message || '요청 실패')),
);

// ── Auth API ───────────────────────────────────────────────
export const authAPI = {
  checkSetup: () => api.get('/auth/check'),
  setup: (data) => api.post('/auth/setup', data),
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

// ── Teachers API ───────────────────────────────────────────
export const teachersAPI = {
  getAll: () => api.get('/teachers'),
  create: (data) => api.post('/teachers', data),
  delete: (id) => api.delete(`/teachers/${id}`),
  changePassword: (data) => api.patch('/teachers/password', data),
};

// ── Students API ───────────────────────────────────────────
export const studentsAPI = {
  getCount: (year) =>
    api.get('/students/count', { params: { year: year || currentSchoolYear() } }),
  getAll: (year, includeInactive = false) =>
    api.get('/students', { params: { year: year || currentSchoolYear(), includeInactive } }),
  bulkCreate: (students, year) =>
    api.post('/students/bulk', { students, school_year: year || currentSchoolYear() }),
  create: (student, year) =>
    api.post('/students', { ...student, school_year: year || currentSchoolYear() }),
  update: (id, data) => api.put(`/students/${id}`, data),
  deactivate: (id) => api.patch(`/students/${id}/deactivate`),
  activate:   (id) => api.patch(`/students/${id}/activate`),
  delete: (id, year) =>
    api.delete(`/students/${id}`, { params: { year: year || currentSchoolYear() } }),
};

// ── Categories API ─────────────────────────────────────────
export const categoriesAPI = {
  getAll: (year) =>
    api.get('/categories', { params: { year: year || currentSchoolYear() } }),
  create: (data, year) =>
    api.post('/categories', { ...data, school_year: year || currentSchoolYear() }),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// ── Evaluations API ────────────────────────────────────────
export const evaluationsAPI = {
  getByCategory: (categoryId, year) =>
    api.get(`/evaluations/category/${categoryId}`, { params: { year: year || currentSchoolYear() } }),
  getByStudent: (studentId, year) =>
    api.get(`/evaluations/student/${studentId}`, { params: { year: year || currentSchoolYear() } }),
  create: (data, year) =>
    api.post('/evaluations', { ...data, school_year: year || currentSchoolYear() }),
  update: (id, data) => api.put(`/evaluations/${id}`, data),
  delete: (id) => api.delete(`/evaluations/${id}`),
  deleteAllByCategory: (categoryId, year) =>
    api.delete(`/evaluations/category/${categoryId}/all`, { params: { year: year || currentSchoolYear() } }),
  getGradeSelections: (year) =>
    api.get('/grade/selections', { params: { year: year || currentSchoolYear() } }),
  saveGradeSelections: (selections, year) =>
    api.put('/grade/selections', { selections, year: year || currentSchoolYear() }),
};

// ── Attendance API ─────────────────────────────────────────
export const attendanceAPI = {
  getRecords: (year, month) =>
    api.get('/attendance/records', { params: { year: year || currentSchoolYear(), month } }),
  saveRecord: (studentId, recordDate, attType, year) =>
    api.put('/attendance/records', {
      records: [{ student_id: studentId, record_date: recordDate, att_type: attType }],
      year: year || currentSchoolYear(),
    }),
  getNotes: (year, month) =>
    api.get('/attendance/notes', { params: { year: year || currentSchoolYear(), month } }),
  saveNote: (studentId, recordDate, note, year) =>
    api.put('/attendance/notes', { student_id: studentId, record_date: recordDate, note, year: year || currentSchoolYear() }),
  getEvents: (year) =>
    api.get('/attendance/events', { params: { year: year || currentSchoolYear() } }),
  saveEvents: (events, year) =>
    api.put('/attendance/events', { events, year: year || currentSchoolYear() }),
  getSemester: (year) =>
    api.get('/attendance/semester', { params: { year: year || currentSchoolYear() } }),
  saveSemester: (data, year) =>
    api.put('/attendance/semester', { ...data, year: year || currentSchoolYear() }),
};

// ── Checklist API ──────────────────────────────────────────
export const checklistAPI = {
  getTopics: (year) =>
    api.get('/checklist/topics', { params: { year: year || currentSchoolYear() } }),
  createTopic: (name, year) =>
    api.post('/checklist/topics', { name, school_year: year || currentSchoolYear() }),
  toggleTopic: (id) => api.patch(`/checklist/topics/${id}/toggle`),
  deleteTopic: (id) => api.delete(`/checklist/topics/${id}`),
  getItems: (topicId) => api.get(`/checklist/topics/${topicId}/items`),
  createItem: (topic_id, item_name) => api.post('/checklist/items', { topic_id, item_name }),
  deleteItem: (id) => api.delete(`/checklist/items/${id}`),
  getChecks: (topicId) => api.get(`/checklist/checks/${topicId}`),
  toggleCheck: (topic_id, item_id, student_id) =>
    api.post('/checklist/checks/toggle', { topic_id, item_id, student_id }),
};

// ── Seating API ────────────────────────────────────────────
export const seatingAPI = {
  getArrangements: (year) =>
    api.get('/seating/arrangements', { params: { year: year || currentSchoolYear() } }),
  createArrangement: (title, year) =>
    api.post('/seating/arrangements', { title, school_year: year || currentSchoolYear() }),
  getArrangementDetails: (id) => api.get(`/seating/arrangements/${id}`),
  deleteArrangement: (id) => api.delete(`/seating/arrangements/${id}`),
  savePositions: (id, positions) =>
    api.put(`/seating/arrangements/${id}/positions`, { positions }),
  savePreferences: (id, prefs) =>
    api.put(`/seating/arrangements/${id}/preferences`, prefs),
  getHistory: (studentId) => api.get(`/seating/history/${studentId}`),
  getHistorySummary: (year) =>
    api.get('/seating/history-summary', { params: { year: year || currentSchoolYear() } }),
  aiChat: (data) =>
    api.post('/seating/ai-chat', { ...data, year: data.year || currentSchoolYear() }),
};

// ── Behavior API ───────────────────────────────────────────
export const behaviorAPI = {
  getLogs: (year, studentId) =>
    api.get('/behavior/logs', { params: { year: year || currentSchoolYear(), studentId } }),
  createLog: (data, year) =>
    api.post('/behavior/logs', { ...data, year: year || currentSchoolYear() }),
  updateLog: (id, content) => api.put(`/behavior/logs/${id}`, { content }),
  deleteLog: (id) => api.delete(`/behavior/logs/${id}`),
  getChecklist: (studentId, year) =>
    api.get(`/behavior/checklist/${studentId}`, { params: { year: year || currentSchoolYear() } }),
  saveChecklist: (studentId, data, year) =>
    api.put(`/behavior/checklist/${studentId}`, { ...data, year: year || currentSchoolYear() }),
};

// ── Grade API ──────────────────────────────────────────────
export const gradeAPI = {
  getResults: (year) =>
    api.get('/grade/results', { params: { year: year || currentSchoolYear() } }),
  updateResult: (id, generated_text) =>
    api.put(`/grade/results/${id}`, { generated_text }),
  generate: (data) =>
    api.post('/grade/generate', { ...data, year: data.year || currentSchoolYear() }),
};

// ── Album API ──────────────────────────────────────────────
export const albumAPI = {
  list: () => api.get('/album'),
  upload: (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post('/album/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (filename) => api.delete(`/album/${encodeURIComponent(filename)}`),
};

// ── Presentations API ──────────────────────────────────────
export const presentationAPI = {
  getDaily: (date) =>
    api.get('/presentations/daily', { params: { date } }),
  increment: (studentId, date, arrangementId) =>
    api.post('/presentations/increment', { student_id: studentId, date, arrangement_id: arrangementId }),
  decrement: (studentId, date) =>
    api.post('/presentations/decrement', { student_id: studentId, date }),
  toggleSpecial: (studentId, date, arrangementId) =>
    api.post('/presentations/toggle-special', { student_id: studentId, date, arrangement_id: arrangementId }),
  saveDaily: (entries) => api.put('/presentations/daily', { entries }),
  getWeekly: () => api.get('/presentations/weekly'),
  getStats:  () => api.get('/presentations/stats'),
};

// ── Today API ──────────────────────────────────────────────
export const todayAPI = {
  getMemo: (date) => api.get(`/today/memo?date=${date}`),
  saveMemo: (date, content) => api.post('/today/memo', { date, content }),
  getTodos: (date) => api.get(`/today/todos?date=${date}`),
  addTodo: (date, text) => api.post('/today/todos', { date, text }),
  toggleTodo: (id) => api.patch(`/today/todos/${id}/toggle`),
  deleteTodo: (id) => api.delete(`/today/todos/${id}`),
  carryOver: (from_date, to_date) => api.post('/today/todos/carry-over', { from_date, to_date }),
  getNotice: (date) => api.get(`/today/notice?date=${date}`),
  saveNotice: (date, content) => api.post('/today/notice', { date, content }),
};
