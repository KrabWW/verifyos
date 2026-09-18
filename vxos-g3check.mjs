// G3 自检：npx tsc 编译两个新模块到 .g3tmp 后运行本文件
import { classifyFinding, fingerprint, dedupeFindings, splitFindings } from './.g3tmp/findings-dedupe.js';
import { annotateCoverage } from './.g3tmp/area-coverage.js';
let fails = 0;
const ok = (name, cond, d = '') => { console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (cond ? '' : ' | ' + d)); if (!cond) fails++; };

// classify
ok('classify HTTP500=defect', classifyFinding({ level: 'red', title: 'HTTP 502', detail: 'xxx（http://a/b）返回 HTTP 502' }) === 'defect');
ok('classify 登录墙=navigational', classifyFinding({ level: 'amber', title: '登录墙', detail: 'http://a/login 存在密码表单' }) === 'navigational');
ok('classify 慢响应=risk', classifyFinding({ level: 'amber', title: '慢响应', detail: '页面（http://a/c）加载耗时 8.2s' }) === 'risk');

// fingerprint 稳定性
const f1 = { level: 'red', title: 'HTTP 502', detail: 'xx（http://a/b?x=1）返回 HTTP 502' };
const f2 = { level: 'red', title: 'HTTP 502', detail: 'xx（http://a/b?x=1）返回 HTTP 502' };
ok('fingerprint 一致', fingerprint(f1) === fingerprint(f2), fingerprint(f1) + ' vs ' + fingerprint(f2));

// dedupe：相似合并 + 置信度提升
const r = dedupeFindings([f1, f2, { level: 'amber', title: '慢响应', detail: '页面（http://a/c）加载耗时 8.2s' }]);
ok('dedupe kept=2', r.kept.length === 2, 'got ' + r.kept.length);
ok('mergedCount=1', r.mergedCount === 1);
ok('occurrences=2', r.kept[0].occurrences === 2);
ok('confidence 0.7→0.85', r.kept[0].confidence === 0.85, String(r.kept[0].confidence));

// split
const sp = splitFindings([f1, { level: 'amber', title: '登录墙', detail: 'x' }]);
ok('split defect=1 nav=1 risk=0', sp.defect.length === 1 && sp.navigational.length === 1 && sp.risk.length === 0);

// coverage
const areas = [
  { title: '登录表单', severity: 'high' },
  { title: '文章编辑器', severity: 'info' },
];
const steps = [{ text: '打开登录页' }, { text: '填登录表单并提交' }, { text: 'AI 回归：验证 slug 格式' }];
const cov = annotateCoverage(areas, steps);
ok('登录流程 coveredBy', cov[0].coveredBy === 'step#2', JSON.stringify(cov[0]));
ok('文章编辑器 uncovered', cov[1].uncoveredReason === '步骤未触达该区域', JSON.stringify(cov[1]));
const cov0 = annotateCoverage(areas, []);
ok('空步骤原因', cov0[0].uncoveredReason === '本次 Run 无回归步骤');

console.log(fails === 0 ? 'G3 SELFCHECK ALL PASS' : 'G3 SELFCHECK FAILED: ' + fails);
process.exit(fails === 0 ? 0 : 1);
