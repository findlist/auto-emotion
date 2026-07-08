import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
};

function randomPhone() {
  const prefix = '138';
  let number = '';
  for (let i = 0; i < 8; i++) {
    number += Math.floor(Math.random() * 10);
  }
  return prefix + number;
}

function login(phone, password) {
  const payload = JSON.stringify({ phone, password });
  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.token;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (success) {
    const body = JSON.parse(res.body);
    return body.data.token;
  }
  return null;
}

function quickMatch(token) {
  const payload = JSON.stringify({
    nickname: `player_${Math.floor(Math.random() * 10000)}`,
    socketId: `socket_${Math.floor(Math.random() * 100000)}`,
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  const res = http.post(`${BASE_URL}/api/match/quick`, payload, params);

  const success = check(res, {
    'match status 200 or 400': (r) => r.status === 200 || r.status === 400,
  });

  errorRate.add(!success);
  return res;
}

function settle(token) {
  const userId = `user_${Math.floor(Math.random() * 100000)}`;
  const payload = JSON.stringify({
    roomId: `room_${Math.floor(Math.random() * 100000)}`,
    mode: 'ranked',
    durationSeconds: 180,
    players: [
      { userId, nickname: `player_${userId}`, score: 1000, damage: 5000, stressKeywords: ['压力', '焦虑'] },
      { userId: `user_${Math.floor(Math.random() * 100000)}`, nickname: 'opponent', score: 800, damage: 3000, stressKeywords: [] },
    ],
  });
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  const res = http.post(`${BASE_URL}/api/settle`, payload, params);

  const success = check(res, {
    'settle status 200 or 400': (r) => r.status === 200 || r.status === 400,
  });

  errorRate.add(!success);
  return res;
}

function getIdleStatus(token) {
  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const res = http.get(`${BASE_URL}/api/idle/status`, params);

  const success = check(res, {
    'idle status 200 or 401': (r) => r.status === 200 || r.status === 401,
  });

  errorRate.add(!success);
  return res;
}

export default function () {
  const phone = randomPhone();
  const password = 'test123456';

  const token = login(phone, password);

  if (token) {
    quickMatch(token);
    sleep(0.5);

    settle(token);
    sleep(0.5);

    getIdleStatus(token);
    sleep(0.5);
  } else {
    sleep(1);
  }
}
