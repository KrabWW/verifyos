/**
 * CoverageBoard 演示数据：与 src/types.ts 中 CoverageReport / UncoveredApi 结构一致，
 * 供看板在无后端数据时渲染，也可作为联调时的字段参考。
 */
import type { CoverageReport } from '@/types';

export const mockCoverageReport: CoverageReport = {
  total: 30,
  covered_count: 20,
  uncovered_count: 10,
  rate: 0.667,
  operations: [
    { api_key: 'GET /users/:id', api_definition_id: 'a1', method: 'GET', path: '/users/:id', covered: true, codes: [{ status_code: 200, covered: true }, { status_code: 404, covered: true }], codes_fully_covered: true, test_case_count: 6, test_case_ids: [], last_tested_at: '2026-09-07T10:20:00Z' },
    { api_key: 'GET /users', api_definition_id: 'a2', method: 'GET', path: '/users', covered: true, codes: [{ status_code: 200, covered: true }], codes_fully_covered: true, test_case_count: 4, test_case_ids: [], last_tested_at: '2026-09-07T09:00:00Z' },
    { api_key: 'POST /users', api_definition_id: 'a3', method: 'POST', path: '/users', covered: true, codes: [{ status_code: 201, covered: true }, { status_code: 422, covered: false }], codes_fully_covered: false, test_case_count: 2, test_case_ids: [], last_tested_at: '2026-09-06T18:40:00Z' },
    { api_key: 'PATCH /users/:id', api_definition_id: 'a4', method: 'PATCH', path: '/users/:id', covered: true, codes: [{ status_code: 200, covered: true }, { status_code: 404, covered: false }, { status_code: 422, covered: false }], codes_fully_covered: false, test_case_count: 1, test_case_ids: [], last_tested_at: '2026-09-05T14:10:00Z' },
    { api_key: 'POST /auth/login', api_definition_id: 'a5', method: 'POST', path: '/auth/login', covered: true, codes: [{ status_code: 200, covered: true }, { status_code: 401, covered: true }], codes_fully_covered: true, test_case_count: 8, test_case_ids: [], last_tested_at: '2026-09-08T02:30:00Z' },
    { api_key: 'POST /auth/refresh', api_definition_id: 'a6', method: 'POST', path: '/auth/refresh', covered: false, codes: [{ status_code: 200, covered: false }, { status_code: 401, covered: false }], codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null },
    { api_key: 'GET /orders', api_definition_id: 'a7', method: 'GET', path: '/orders', covered: true, codes: [{ status_code: 200, covered: true }], codes_fully_covered: true, test_case_count: 3, test_case_ids: [], last_tested_at: '2026-09-07T16:00:00Z' },
    { api_key: 'POST /orders', api_definition_id: 'a8', method: 'POST', path: '/orders', covered: true, codes: [{ status_code: 201, covered: true }, { status_code: 402, covered: false }, { status_code: 409, covered: false }], codes_fully_covered: false, test_case_count: 2, test_case_ids: [], last_tested_at: '2026-09-06T11:25:00Z' },
    { api_key: 'DELETE /orders/:id', api_definition_id: 'a9', method: 'DELETE', path: '/orders/:id', covered: false, codes: [{ status_code: 204, covered: false }, { status_code: 404, covered: false }], codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null },
    { api_key: 'GET /pay/balance', api_definition_id: 'a10', method: 'GET', path: '/pay/balance', covered: true, codes: [{ status_code: 200, covered: true }], codes_fully_covered: true, test_case_count: 5, test_case_ids: [], last_tested_at: '2026-09-08T01:12:00Z' },
    { api_key: 'POST /pay/refund', api_definition_id: 'a11', method: 'POST', path: '/pay/refund', covered: false, codes: [{ status_code: 200, covered: false }, { status_code: 402, covered: false }, { status_code: 409, covered: false }], codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null },
    { api_key: 'GET /webhooks', api_definition_id: 'a12', method: 'GET', path: '/webhooks', covered: false, codes: [{ status_code: 200, covered: false }], codes_fully_covered: false, test_case_count: 0, test_case_ids: [], last_tested_at: null },
  ],
  uncovered: [
    { api_key: 'POST /pay/refund', api_definition_id: 'a11', method: 'POST', path: '/pay/refund', uncovered_codes: [200, 402, 409], risk: 86, operation_uncovered: true },
    { api_key: 'DELETE /orders/:id', api_definition_id: 'a9', method: 'DELETE', path: '/orders/:id', uncovered_codes: [204, 404], risk: 74, operation_uncovered: true },
    { api_key: 'POST /auth/refresh', api_definition_id: 'a6', method: 'POST', path: '/auth/refresh', uncovered_codes: [200, 401], risk: 65, operation_uncovered: true },
    { api_key: 'GET /webhooks', api_definition_id: 'a12', method: 'GET', path: '/webhooks', uncovered_codes: [200], risk: 38, operation_uncovered: true },
    { api_key: 'PATCH /users/:id', api_definition_id: 'a4', method: 'PATCH', path: '/users/:id', uncovered_codes: [404, 422], risk: 27, operation_uncovered: false },
    { api_key: 'POST /orders', api_definition_id: 'a8', method: 'POST', path: '/orders', uncovered_codes: [402, 409], risk: 19, operation_uncovered: false },
  ],
  partially_covered: [],
};

/** 最近 7 天覆盖率趋势（%），x 轴为日期标签 */
export interface TrendPoint {
  label: string;
  rate: number;
}

export const coverageTrend: TrendPoint[] = [
  { label: '09-02', rate: 48 },
  { label: '09-03', rate: 52 },
  { label: '09-04', rate: 55 },
  { label: '09-05', rate: 58 },
  { label: '09-06', rate: 61 },
  { label: '09-07', rate: 64 },
  { label: '09-08', rate: 67 },
];
