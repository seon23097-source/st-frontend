import { io } from 'socket.io-client';
import { API_ORIGIN, getToken } from './api';

let socket = null;

/**
 * Socket.IO 싱글톤 - 한 번 연결되면 같은 인스턴스 재사용
 * 메인 화면과 새 창(전체화면)에서 각각 호출하면 각자의 소켓을 갖지만
 * 서버는 같은 teacher 룸에 join 시키므로 동기화됨
 */
export function getSocket() {
  if (socket && socket.connected) return socket;
  if (socket) {
    // 끊긴 상태면 재연결 시도
    socket.connect();
    return socket;
  }
  const token = getToken();
  if (!token) return null;

  socket = io(`${API_ORIGIN}/presentations`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[socket] 연결됨', socket.id);
  });
  socket.on('disconnect', (reason) => {
    console.log('[socket] 연결 해제:', reason);
  });
  socket.on('connect_error', (err) => {
    console.warn('[socket] 연결 실패:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
