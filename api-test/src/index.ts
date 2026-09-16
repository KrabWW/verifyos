/**
 * API 测试项目 hello 入口。
 * 运行方式：npm run dev（tsx watch）或 npm run start（编译后 dist）。
 * 功能：打印项目名/版本/运行时 + 三大能力对标 + 四张核心表占位。
 */
import { PROJECT_NAME, VERSION, CAPABILITIES } from './version.js';
import { MODULE as RECORDER } from './recorder/index.js';
import { MODULE as ASSERTION } from './assertion/index.js';
import { MODULE as INVENTORY } from './inventory/index.js';
import { MODULE as COVERAGE } from './coverage/index.js';
import { MODULE as GENERATOR } from './generator/index.js';
import { MODULE as SCENARIO } from './scenario/index.js';
import { MODULE as AI } from './ai/index.js';

// P2 AI Intelligent Layer 出口（re-export 供包消费方使用）
export * from './ai/index.js';
export { analyzeTraffic, analyzeHar, renderInsight } from './insight/traffic.js';
export type { TrafficInsight, AnalyzeTrafficOptions } from './insight/traffic.js';
export { diffSpecs, reviewDiff } from './insight/spec-diff.js';
export type { SpecDiff, EndpointDiff, SpecChange, DiffSeverity, ChangeScope } from './insight/spec-diff.js';
export { generateApiDoc, inferSummary } from './docs-gen/generate.js';
export {
  PROVIDER_PRESETS,
} from './config/presets.js';
export {
  loadModelConfig,
  saveUserLayer,
  listProviders,
  getActiveLlmConfig,
  maskKey,
  loadUserLayer,
} from './config/model-config.js';
export type { ProviderPreset, ProviderOption, ModelConfigState, UserLayer } from './config/model-config.js';
export * from './stream/index.js';

const CORE_TABLES = ['api_definition', 'traffic_record', 'test_case', 'coverage'] as const;

function main(): void {
  const line = '='.repeat(60);
  console.log(line);
  console.log(`${PROJECT_NAME}  v${VERSION}`);
  console.log(`运行时 Node.js ${process.version}`);
  console.log(line);

  console.log('\n[能力对标]');
  for (const c of CAPABILITIES) {
    console.log(`  - ${c.name}  （对标 ${c.ref}）`);
  }

  console.log('\n[核心模块占位]');
  console.log(`  - recorder  : 流量录制层（${RECORDER}）`);
  console.log(`  - generator : 录制→测试生成层（${GENERATOR}）`);
  console.log(`  - assertion : 断言层（${ASSERTION}）`);
  console.log(`  - inventory : API inventory（${INVENTORY}）`);
  console.log(`  - coverage  : 覆盖率（${COVERAGE}）`);
  console.log(`  - scenario  : 场景编排 + 环境变量 + 报告（${SCENARIO}）`);

  console.log('\n[核心数据表草案]');
  for (const t of CORE_TABLES) {
    console.log(`  - ${t}`);
  }

  console.log(`\n${line}`);
  console.log('脚手架就绪。技术选型见 docs/tech-selection.md，里程碑见 README.md。');
}

main();
