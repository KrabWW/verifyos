/**
 * 场景报告导出（A8）：md / json / junit 三种格式。
 *
 * - markdown：人读报告（每接口 pass/fail + 断言明细 + 耗时）；
 * - json：结构化报告（可程序化消费）；
 * - junit：CI 兼容的 XML（testsuites/testsuite/testcase + failure）。
 */
import type { ScenarioReport } from './types.js';

/** 报告 → JSON 字符串 */
export function reportToJson(report: ScenarioReport): string {
  return JSON.stringify(report, null, 2);
}

/** 报告 → Markdown 字符串 */
export function reportToMarkdown(report: ScenarioReport): string {
  const lines: string[] = [];
  lines.push(`# 场景测试报告：${report.scenario_name}`);
  lines.push('');
  lines.push(`- 环境：${report.environment_name}（${report.base_url}）`);
  lines.push(`- 开始：${report.started_at}`);
  lines.push(`- 结束：${report.finished_at}`);
  lines.push(`- 总耗时：${report.duration_ms} ms`);
  lines.push(
    `- 结果：${report.passed ? 'PASS' : 'FAIL'}（步骤 ${report.passed_steps}/${report.total_steps}，断言 ${report.passed_assertions}/${report.total_assertions}${report.total_iterations > 0 ? `，数据轮次 ${report.total_iterations}` : ''}）`,
  );
  lines.push('');

  for (const s of report.steps) {
    lines.push(`## ${s.passed ? 'PASS' : 'FAIL'} ${s.name}`);
    // 条件步骤：标注实际走的分支；循环步骤：标注执行轮数（数据驱动步骤标注第几轮数据）
    if (s.kind === 'condition' && s.branch) {
      const exprNote = s.condition_expr ? `（${s.condition_expr}）` : '';
      lines.push(`- 分支：${s.branch === 'then' ? 'then（真）' : s.branch === 'else' ? 'else（假）' : 'none'}${exprNote}`);
    }
    if (s.kind === 'loop') {
      const modeNote = s.loop_mode ? `模式 ${s.loop_mode}，` : '';
      lines.push(`- 循环：${modeNote}执行 ${s.iterations ?? 0} 轮`);
    }
    if (s.kind === 'api' && (s.iteration ?? 0) > 0) {
      lines.push(`- 数据轮次：第 ${s.iteration} 轮`);
    }
    if (s.kind === 'api') {
      lines.push(`- ${s.method} ${s.path}（${s.url}）`);
      lines.push(`- 状态码：${s.status_code ?? 'N/A'}，耗时：${s.latency_ms} ms`);
    }
    if (s.error) lines.push(`- 错误：${s.error}`);
    if (Object.keys(s.extracted).length > 0) {
      lines.push(`- 提取变量：${Object.entries(s.extracted).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    for (const a of s.assertions) {
      const loc = a.target ? ` ${a.target}` : '';
      lines.push(`  - ${a.passed ? 'PASS' : 'FAIL'} [${a.type}]${loc} ${a.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** XML 特殊字符转义 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 报告 → JUnit XML 字符串 */
export function reportToJunit(report: ScenarioReport): string {
  const suiteTime = (report.duration_ms / 1000).toFixed(3);

  const cases = report.steps
    .map((s) => {
      const time = (s.latency_ms / 1000).toFixed(3);
      if (s.passed) {
        return `    <testcase name="${escapeXml(s.name)}" classname="${escapeXml(report.scenario_name)}" time="${time}" />`;
      }
      const failure = s.error
        ? escapeXml(s.error)
        : escapeXml(s.assertions.filter((a) => !a.passed).map((a) => a.message).join('; '));
      return [
        `    <testcase name="${escapeXml(s.name)}" classname="${escapeXml(report.scenario_name)}" time="${time}">`,
        `      <failure message="${escapeXml(s.name)}">${failure}</failure>`,
        '    </testcase>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${report.total_steps}" failures="${report.failed_steps}" time="${suiteTime}">`,
    `  <testsuite name="${escapeXml(report.scenario_name)}" tests="${report.total_steps}" failures="${report.failed_steps}" time="${suiteTime}">`,
    cases,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}
