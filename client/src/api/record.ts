// client/src/api/record.ts
// 战绩 API

import http from './http';

export const recordApi = {
  list: (page = 1, pageSize = 10) =>
    http.get('/game-records', { params: { page, pageSize } }).then((r) => r.data),
  get: (id: string) => http.get(`/game-records/${id}`).then((r) => r.data),
};
