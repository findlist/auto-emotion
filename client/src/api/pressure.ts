import http from './http';

export interface PressureData {
  work: number;
  life: number;
  social: number;
  finance: number;
  health: number;
  hasData: boolean;
}

export async function getPressureStats(): Promise<PressureData> {
  const res = await http.get('/user/pressure-stats');
  return res.data as PressureData;
}
