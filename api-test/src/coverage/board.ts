/**
 * 覆盖率看板渲染（控制台可读文本，无需 GUI）。
 *
 * - renderBoard：总覆盖 + 按 operation 分组的覆盖明细；
 * - renderUncovered：未覆盖清单（驱动补测试）。
 * 输出纯 ASCII 标记（ok/--/covered/uncovered），中文注释，避免依赖 emoji。
 */
import type { CoverageReport, UncoveredApi } from './types.js';

/** 左填充（用于数字/短标识对齐） */
function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

/** 右填充（用于 path/状态列对齐） */
function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/** 渲染覆盖率看板为字符串 */
export function renderBoard(report: CoverageReport): string {
  const pct = (report.rate * 100).toFixed(1);
  const lines: string[] = [];
  const line = '='.repeat(58);

  lines.push(line);
  lines.push(' API 覆盖率看板');
  lines.push(line);
  lines.push(` 总 API 数 : ${report.total}`);
  lines.push(` 已测     : ${report.covered_count}`);
  lines.push(` 未测     : ${report.uncovered_count}`);
  lines.push(` 覆盖率   : ${pct}%`);
  lines.push('');
  lines.push(' [按 operation 覆盖明细]');
  lines.push(`   ${padRight('METHOD', 7)} ${padRight('PATH', 22)} ${padRight('STATE', 10)} CODES`);
  for (const o of report.operations) {
    const state = o.covered ? (o.codes_fully_covered ? 'covered' : 'partial') : 'uncovered';
    const codes = o.codes.length > 0
      ? o.codes.map((c) => `${c.status_code}:${c.covered ? 'ok' : '--'}`).join(' ')
      : '-';
    lines.push(`   ${padRight(o.method, 7)} ${padRight(o.path, 22)} ${padRight(state, 10)} ${codes}`);
  }
  lines.push(line);
  return lines.join('\n');
}

/** 渲染未覆盖清单为字符串 */
export function renderUncovered(list: UncoveredApi[]): string {
  const lines: string[] = [];
  lines.push(' [未覆盖清单]');
  if (list.length === 0) {
    lines.push('   （无未覆盖 API）');
    return lines.join('\n');
  }
  lines.push(`   ${padRight('METHOD', 7)} ${padRight('PATH', 22)} ${padRight('RISK', 5)} CODES`);
  for (const item of list) {
    const codes = item.uncovered_codes.length > 0 ? item.uncovered_codes.join(',') : '-';
    lines.push(`   ${padRight(item.method, 7)} ${padRight(item.path, 22)} ${padRight(String(item.risk), 5)} ${codes}`);
  }
  return lines.join('\n');
}

/** 打印看板 + 未覆盖清单 */
export function printBoard(report: CoverageReport): void {
  console.log(renderBoard(report));
  console.log('');
  console.log(renderUncovered(report.uncovered));
  console.log('');
}

/** 打印未覆盖清单（用于按 risk 排序等场景） */
export function printUncovered(list: UncoveredApi[]): void {
  console.log(renderUncovered(list));
  console.log('');
}
