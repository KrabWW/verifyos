"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * B1 冒烟测试（pg-mem，免 Docker）：
 * 1) 迁移在内存 PG 中可重复执行（两遍）
 * 2) 全链路 CRUD：org → project → application(web) → environment(preview) → browser_state
 *    → exploration → qa_point → verification → dependency(resume_from 唯一约束)
 *    → run → step → evidence → output_value → test_plan → device_preset → audit_log
 * 3) 依赖约束：第二个 resume_from 必须被拒绝，wait_for 允许多个
 */
var pg_mem_1 = require("pg-mem");
var migrate_1 = require("./migrate");
function assert(cond, msg) {
    if (!cond)
        throw new Error('断言失败: ' + msg);
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var db, pool, pgmemTransform, q, org, prj, app, env, bs, exp, node1, node2, qa, qa2, ver1, ver2, dupRejected, _a, ver3, run, st, checks, _i, checks_1, _b, name_1, sql, expect, r, t;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    db = (0, pg_mem_1.newDb)({ noFS: true });
                    pool = db.adapters.createPg().Pool ? new (db.adapters.createPg().Pool)() : null;
                    if (!pool)
                        throw new Error('pg-mem Pool 创建失败');
                    console.log('═══ B1 冒烟测试（pg-mem）═══');
                    console.log('[1] 迁移执行两遍（可重复）…');
                    pgmemTransform = function (sql) {
                        return sql
                            .split('\n')
                            .filter(function (l) { return !/^\s*CREATE EXTENSION/i.test(l); })
                            .join('\n')
                            .replace(/vector\(1024\)/g, 'text');
                    };
                    return [4 /*yield*/, (0, migrate_1.runMigrations)(pool, { transform: pgmemTransform })];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, (0, migrate_1.runMigrations)(pool, { transform: pgmemTransform })];
                case 2:
                    _c.sent();
                    console.log('[2] 全链路 CRUD…');
                    q = function (sql, p) { return pool.query(sql, p); };
                    return [4 /*yield*/, q("INSERT INTO organization(short_id,name) VALUES('org_acme','ACME') RETURNING id")];
                case 3:
                    org = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO project(short_id,org_id,name) VALUES('prj_order',$1,'\u8BA2\u5355\u7BA1\u7406\u7CFB\u7EDF') RETURNING id", [org.rows[0].id])];
                case 4:
                    prj = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO application(short_id,project_id,name,type) VALUES('app_web01',$1,'\u8BA2\u5355 Web','web') RETURNING id", [prj.rows[0].id])];
                case 5:
                    app = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO environment(short_id,application_id,name,url,is_preview,branch,pr_number) VALUES('env_pr128',$1,'PR-128 \u9884\u89C8','https://pr-128.example.com',true,'fix/refund',128) RETURNING id", [app.rows[0].id])];
                case 6:
                    env = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO browser_state(short_id,environment_id,name,storage_uri) VALUES('bs_admin',$1,'admin_logged_in','s3://ev/bs/admin.json') RETURNING id, expires_at", [env.rows[0].id])];
                case 7:
                    bs = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO exploration(short_id,application_id,environment_id,intent,start_url,status,output_state_id) VALUES('exp_1024',$1,$2,'\u63A2\u7D22\u8BA2\u5355\u9000\u6B3E\u6D41\u7A0B','https://crm.test.example.com','complete',$3) RETURNING id", [app.rows[0].id, env.rows[0].id, bs.rows[0].id])];
                case 8:
                    exp = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO exploration_iteration(exploration_id,url,depth,source_action,intent_score,found_actions) VALUES($1,'/orders',1,'click \u8BA2\u5355',87,'[{\"tag\":\"button\",\"text\":\"\u7533\u8BF7\u9000\u6B3E\"}]')", [exp.rows[0].id])];
                case 9:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO graph_node(application_id,type,ref,title) VALUES($1,'page','/orders','\u8BA2\u5355\u5217\u8868') RETURNING id", [app.rows[0].id])];
                case 10:
                    node1 = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO graph_node(application_id,type,ref,title) VALUES($1,'page','/orders/new','\u65B0\u5EFA\u8BA2\u5355') RETURNING id", [app.rows[0].id])];
                case 11:
                    node2 = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO graph_edge(application_id,from_node,to_node,action) VALUES($1,$2,$3,'click \u65B0\u5EFA\u8BA2\u5355')", [app.rows[0].id, node1.rows[0].id, node2.rows[0].id])];
                case 12:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO qa_point(short_id,application_id,title,category,risk,status,confidence,source) VALUES('qa_1028',$1,'\u7BA1\u7406\u5458\u53EF\u4EE5\u65B0\u589E\u5458\u5DE5','\u6B63\u5E38\u6D41\u7A0B','high','ready',0.92,'{\"requirementRef\":\"\u00A73.1\"}') RETURNING id", [app.rows[0].id])];
                case 13:
                    qa = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO qa_point(short_id,application_id,title,category,risk,status) VALUES('qa_1029',$1,'\u65B0\u589E\u6210\u529F\u540E\u5458\u5DE5\u51FA\u73B0\u5728\u5217\u8868\u4E2D','\u6B63\u5E38\u6D41\u7A0B','medium','ready') RETURNING id", [app.rows[0].id])];
                case 14:
                    qa2 = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_001',$1,'\u65B0\u589E\u5458\u5DE5','\u7BA1\u7406\u5458','ready') RETURNING id", [qa.rows[0].id])];
                case 15:
                    ver1 = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_002',$1,'\u9A8C\u8BC1\u5217\u8868\u51FA\u73B0\u5F20\u4E09','\u7BA1\u7406\u5458','ready') RETURNING id", [qa2.rows[0].id])];
                case 16:
                    ver2 = _c.sent();
                    console.log('[3] 依赖约束…');
                    return [4 /*yield*/, q("INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'resume_from')", [ver2.rows[0].id, ver1.rows[0].id])];
                case 17:
                    _c.sent();
                    dupRejected = false;
                    _c.label = 18;
                case 18:
                    _c.trys.push([18, 20, , 21]);
                    return [4 /*yield*/, q("INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'resume_from')", [ver2.rows[0].id, ver1.rows[0].id])];
                case 19:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 20:
                    _a = _c.sent();
                    dupRejected = true;
                    return [3 /*break*/, 21];
                case 21:
                    assert(dupRejected, '第二个 resume_from 必须被唯一索引拒绝');
                    return [4 /*yield*/, q("INSERT INTO verification(short_id,qa_point_id,title,actor,status) VALUES('ver_003',$1,'\u7BA1\u7406\u5458\u767B\u5F55','\u7BA1\u7406\u5458','ready') RETURNING id", [qa.rows[0].id])];
                case 22:
                    ver3 = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'wait_for')", [ver3.rows[0].id, ver1.rows[0].id])];
                case 23:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO dependency(verification_id,depends_on_id,kind) VALUES($1,$2,'wait_for')", [ver3.rows[0].id, ver2.rows[0].id])];
                case 24:
                    _c.sent();
                    console.log('  ✓ resume_from 恰 1 个约束生效；wait_for 可多个叠加');
                    return [4 /*yield*/, q("INSERT INTO run(short_id,verification_id,target,trigger,verdict,output,duration_ms,finished_at) VALUES('run_1928',$1,'{\"applicationShortId\":\"app_web01\",\"platform\":\"web\",\"environment\":{\"url\":\"https://crm.test.example.com\",\"isPreview\":false}}','manual','fail','{\"emp_code\":\"ZS-001\"}',42000,now()) RETURNING id", [ver1.rows[0].id])];
                case 25:
                    run = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO step(short_id,run_id,idx,title,kind,verdict,duration_ms) VALUES('st_05',$1,4,'\u70B9\u51FB\u4FDD\u5B58','ai','fail',312) RETURNING id", [run.rows[0].id])];
                case 26:
                    st = _c.sent();
                    return [4 /*yield*/, q("INSERT INTO evidence(short_id,run_id,step_id,kind,uri,meta) VALUES('ev_23',$1,$2,'network','s3://ev/run_1928/net.har','{\"status\":500}')", [run.rows[0].id, st.rows[0].id])];
                case 27:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO output_value(run_id,key,value) VALUES($1,'emp_code','ZS-001')", [run.rows[0].id])];
                case 28:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO test_plan(short_id,project_id,name,config) VALUES('pln_smoke',$1,'\u751F\u4EA7\u5DE1\u68C0', '{\"app_web01\":{\"environment\":\"env_prod\",\"devicePreset\":\"dp_desktop\"}}')", [prj.rows[0].id])];
                case 29:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO device_preset(short_id,project_id,name,platform,config) VALUES('dp_desktop',$1,'\u684C\u9762 1440','web','{\"viewport\":\"1440x900\"}')", [prj.rows[0].id])];
                case 30:
                    _c.sent();
                    return [4 /*yield*/, q("INSERT INTO audit_log(project_id,actor,action,target) VALUES($1,'system','credential.use','bs_admin')", [prj.rows[0].id])];
                case 31:
                    _c.sent();
                    console.log('[4] 反查断言…');
                    checks = [
                        ['preview 环境可查', "SELECT count(*)::int AS n FROM environment WHERE is_preview AND pr_number=128", 1],
                        ['迭代 intent_score 落库', "SELECT count(*)::int AS n FROM exploration_iteration WHERE intent_score=87", 1],
                        ['graph 边连通', "SELECT count(*)::int AS n FROM graph_edge", 1],
                        ['失败 run + 证据关联', "SELECT count(*)::int AS n FROM evidence e JOIN run r ON e.run_id=r.id WHERE r.verdict='fail'", 1],
                        ['output_value 跨会话可查', "SELECT count(*)::int AS n FROM output_value WHERE value='ZS-001'", 1],
                    ];
                    _i = 0, checks_1 = checks;
                    _c.label = 32;
                case 32:
                    if (!(_i < checks_1.length)) return [3 /*break*/, 35];
                    _b = checks_1[_i], name_1 = _b[0], sql = _b[1], expect = _b[2];
                    return [4 /*yield*/, q(sql)];
                case 33:
                    r = _c.sent();
                    assert(r.rows[0].n === expect, "".concat(name_1, "\uFF08\u671F\u671B ").concat(expect, "\uFF0C\u5B9E\u5F97 ").concat(r.rows[0].n, "\uFF09"));
                    console.log("  \u2713 ".concat(name_1));
                    _c.label = 34;
                case 34:
                    _i++;
                    return [3 /*break*/, 32];
                case 35: return [4 /*yield*/, q("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")];
                case 36:
                    t = _c.sent();
                    console.log("\n\u2550\u2550\u2550 \u901A\u8FC7 \u00B7 public \u8868 ".concat(t.rows[0].n, " \u5F20 \u00B7 \u8FC1\u79FB\u53EF\u91CD\u590D \u00B7 \u7EA6\u675F\u4E0E\u5168\u94FE\u8DEF\u65AD\u8A00\u5168\u8FC7 \u2550\u2550\u2550"));
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) {
    console.error('✗ 冒烟测试失败:', e.message);
    process.exit(1);
});
