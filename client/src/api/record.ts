// client/src/api/record.ts
// 战绩 API

import http from './http';
import { unwrap } from './unwrap';

export const recordApi = {
  list: (page = 1, pageSize = 10) =>
    unwrap(http.get('/game-records', { params: { page, pageSize } })),
  get: (id: string) => unwrap(http.get(`/game-records/${id}`)),
};
