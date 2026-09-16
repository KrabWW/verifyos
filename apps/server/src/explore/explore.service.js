"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExploreService = void 0;
var common_1 = require("@nestjs/common");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_events_1 = require("node:events");
var agent_core_1 = require("@verifyos/agent-core");
var DEMO_APP = { org: 'org_demo', project: 'prj_demo', app: 'app_demo', name: '演示 CRM' };
/** 问题库（001 之后增量表，IF NOT EXISTS 幂等） */
var CHAT_DDL = "\nCREATE TABLE IF NOT EXISTS chat_message (\n  id bigserial PRIMARY KEY,\n  session_id text NOT NULL DEFAULT 'default',\n  role text NOT NULL CHECK (role IN ('user','assistant')),\n  content text NOT NULL,\n  card jsonb,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_message(session_id, created_at);";
/** 需求导入·忽略清单（F3：cross-check 过滤已忽略疑点，重启不丢） */
var IMPORT_IGNORE_DDL = "\nCREATE TABLE IF NOT EXISTS import_ignore (\n  id bigserial PRIMARY KEY,\n  fingerprint text NOT NULL UNIQUE,\n  title text,\n  created_at timestamptz NOT NULL DEFAULT now()\n);";
/** 问题库（001 之后增量表，IF NOT EXISTS 幂等） */
var ISSUE_DDL = "\nCREATE TABLE IF NOT EXISTS issue (\n  id bigserial PRIMARY KEY,\n  short_id text NOT NULL UNIQUE,\n  application_id bigint NOT NULL REFERENCES application(id),\n  title text NOT NULL,\n  severity text CHECK (severity IN ('high','medium','low')),\n  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),\n  source jsonb NOT NULL DEFAULT '{}',\n  created_at timestamptz NOT NULL DEFAULT now(),\n  resolved_at timestamptz\n);";
/**
 * 一键探索闭环（把 B 系引擎接到产品 API）：
 * Crawler（撞墙→凭据/弹卡）→ Coverage Graph 落 PG → LLM QA 点候选落库。
 * 首次调用自动 ensureSchema（幂等迁移）+ 种子 org/project/application。
 */
var ExploreService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = node_events_1.EventEmitter;
    var ExploreService = _classThis = /** @class */ (function (_super) {
        __extends(ExploreService_1, _super);
        function ExploreService_1() {
            var _this = _super.call(this) || this;
            /** 活动连接：真实 PG 可达 → 真库；否则降级 pg-mem（内存，重启清空） */
            _this.activePool = null;
            _this.poolKind = 'mem';
            // ---- F4/J03: 人工接管控制状态——J03 改为按会话分槽（并发探索互不覆盖） ----
            /** J03: 全部会话（含已结束的，供 control?explorationId=xxx 补看；finished 会话定期清理） */
            _this.sessionMap = new Map();
            /** G10: headful 接管 CDP 接入点（本次探索为 headful 时有值） */
            _this._cdpEndpoint = null;
            /** J03: 最新一次启动的会话 id（旧单值字段的兼容数据源） */
            _this.latestSessionId = null;
            return _this;
        }
        Object.defineProperty(ExploreService_1.prototype, "pg", {
            /** 活动池（controller 存取数据统一走这里） */
            get: function () {
                if (!this.activePool)
                    throw new Error('pool 未初始化');
                return this.activePool;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(ExploreService_1.prototype, "kind", {
            get: function () {
                return this.poolKind;
            },
            enumerable: false,
            configurable: true
        });
        ExploreService_1.prototype.ensurePool = function () {
            return __awaiter(this, void 0, void 0, function () {
                var err_1, _a, url, Pool, real, err_2, newDb, mem;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            if (!(this.activePool && this.poolKind === 'pg')) return [3 /*break*/, 8];
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 3, , 8]);
                            return [4 /*yield*/, this.activePool.query('SELECT 1')];
                        case 2:
                            _d.sent();
                            return [2 /*return*/];
                        case 3:
                            err_1 = _d.sent();
                            console.log('[explore] ⚠️ 真库连接失效，尝试重建：', err_1 instanceof Error ? err_1.message.slice(0, 60) : err_1);
                            _d.label = 4;
                        case 4:
                            _d.trys.push([4, 6, , 7]);
                            return [4 /*yield*/, ((_c = (_b = this.activePool).end) === null || _c === void 0 ? void 0 : _c.call(_b))];
                        case 5:
                            _d.sent();
                            return [3 /*break*/, 7];
                        case 6:
                            _a = _d.sent();
                            return [3 /*break*/, 7];
                        case 7:
                            this.activePool = null;
                            this.poolKind = 'mem';
                            return [3 /*break*/, 8];
                        case 8:
                            url = process.env.DATABASE_URL;
                            if (!url) return [3 /*break*/, 13];
                            _d.label = 9;
                        case 9:
                            _d.trys.push([9, 12, , 13]);
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('pg'); })];
                        case 10:
                            Pool = (_d.sent()).Pool;
                            real = new Pool({ connectionString: url.replace('@localhost:', '@127.0.0.1:'), connectionTimeoutMillis: 2500 });
                            return [4 /*yield*/, real.query('SELECT 1')];
                        case 11:
                            _d.sent();
                            this.activePool = real;
                            this.poolKind = 'pg';
                            console.log('[explore] ✅ 已升级到真实 PostgreSQL');
                            return [2 /*return*/];
                        case 12:
                            err_2 = _d.sent();
                            console.log('[explore] ⏳ 真库不可达，继续 mem：', err_2 instanceof Error ? err_2.message.slice(0, 80) : err_2);
                            return [3 /*break*/, 13];
                        case 13:
                            if (this.activePool)
                                return [2 /*return*/]; // mem 兜底已建
                            return [4 /*yield*/, Promise.resolve().then(function () { return require('pg-mem'); })];
                        case 14:
                            newDb = (_d.sent()).newDb;
                            mem = newDb({ noAstCoverageCheck: true });
                            this.activePool = new (mem.adapters.createPg().Pool)();
                            this.poolKind = 'mem';
                            return [2 /*return*/];
                    }
                });
            });
        };
        ExploreService_1.prototype.llm = function () {
            var _a, _b, _c;
            return {
                apiKey: (_a = process.env.LLM_API_KEY) !== null && _a !== void 0 ? _a : '',
                baseURL: (_b = process.env.LLM_BASE_URL) !== null && _b !== void 0 ? _b : 'https://open.bigmodel.cn/api/paas/v4',
                model: (_c = process.env.LLM_MODEL) !== null && _c !== void 0 ? _c : 'glm-4.5v',
            };
        };
        ExploreService_1.prototype.onModuleInit = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/];
                });
            });
        };
        /** 幂等建表 + 种子；GET 端点也可安全调用 */
        ExploreService_1.prototype.ensureReady = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.ensurePool()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/, this.ensureSchemaAndSeed()];
                    }
                });
            });
        };
        ExploreService_1.prototype.ensureSchemaAndSeed = function () {
            return __awaiter(this, void 0, void 0, function () {
                var sqlPath, sql, org, prj, app, appId;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            sqlPath = node_path_1.default.resolve(process.cwd(), 'migrations/001_init.sql');
                            if (!node_fs_1.default.existsSync(sqlPath)) return [3 /*break*/, 9];
                            sql = node_fs_1.default.readFileSync(sqlPath, 'utf8');
                            // 通用降级：剥离 CREATE EXTENSION；vector(1024)→text
                            // （B4 v1 无向量查询，pgvector 检索为 Phase 后续——升级路径：装扩展后 ALTER 列类型）
                            sql = sql
                                .split('\n')
                                .filter(function (l) { return !/^\s*CREATE EXTENSION/i.test(l); })
                                .join('\n')
                                .replace(/vector\(1024\)/g, 'text');
                            if (!(this.poolKind === 'mem')) return [3 /*break*/, 7];
                            // pg-mem 在 autocommit 下对整文件多语句做 AST 检查误报 Not supported；事务包裹可过
                            return [4 /*yield*/, this.pg.query('BEGIN')];
                        case 1:
                            // pg-mem 在 autocommit 下对整文件多语句做 AST 检查误报 Not supported；事务包裹可过
                            _a.sent();
                            return [4 /*yield*/, this.pg.query(sql)];
                        case 2:
                            _a.sent();
                            return [4 /*yield*/, this.pg.query(CHAT_DDL)];
                        case 3:
                            _a.sent();
                            return [4 /*yield*/, this.pg.query(ISSUE_DDL)];
                        case 4:
                            _a.sent();
                            return [4 /*yield*/, this.pg.query(IMPORT_IGNORE_DDL)];
                        case 5:
                            _a.sent();
                            return [4 /*yield*/, this.pg.query('COMMIT')];
                        case 6:
                            _a.sent();
                            return [3 /*break*/, 9];
                        case 7: return [4 /*yield*/, this.pg.query(sql + CHAT_DDL + ISSUE_DDL + IMPORT_IGNORE_DDL)];
                        case 8:
                            _a.sent(); // 真实 PG 支持多语句；全部 IF NOT EXISTS 幂等
                            _a.label = 9;
                        case 9: return [4 /*yield*/, this.pg.query("SELECT id FROM organization WHERE short_id = $1", [DEMO_APP.org])];
                        case 10:
                            org = _a.sent();
                            if (!(org.rows.length === 0)) return [3 /*break*/, 12];
                            return [4 /*yield*/, this.pg.query("INSERT INTO organization(short_id, name) VALUES($1, $2)", [DEMO_APP.org, '演示组织'])];
                        case 11:
                            _a.sent();
                            _a.label = 12;
                        case 12: return [4 /*yield*/, this.pg.query("SELECT id FROM project WHERE short_id = $1", [DEMO_APP.project])];
                        case 13:
                            prj = _a.sent();
                            if (!(prj.rows.length === 0)) return [3 /*break*/, 15];
                            return [4 /*yield*/, this.pg.query("INSERT INTO project(short_id, org_id, name) VALUES($1, 1, $2)", [DEMO_APP.project, '演示项目'])];
                        case 14:
                            _a.sent();
                            _a.label = 15;
                        case 15: return [4 /*yield*/, this.pg.query("SELECT id FROM application WHERE short_id = $1", [DEMO_APP.app])];
                        case 16:
                            app = _a.sent();
                            if (!(app.rows.length === 0)) return [3 /*break*/, 18];
                            return [4 /*yield*/, this.pg.query("INSERT INTO application(short_id, project_id, name, type) VALUES($1, 1, $2, 'web')", [DEMO_APP.app, DEMO_APP.name])];
                        case 17:
                            _a.sent();
                            _a.label = 18;
                        case 18: return [4 /*yield*/, this.pg.query("SELECT id FROM application WHERE short_id = $1", [DEMO_APP.app])];
                        case 19:
                            appId = _a.sent();
                            return [2 /*return*/, appId.rows[0].id];
                    }
                });
            });
        };
        /** 活动中的会话（finishedAt 为空） */
        ExploreService_1.prototype.runningSessions = function () {
            return __spreadArray([], this.sessionMap.values(), true).filter(function (s) { return s.info.finishedAt === null; });
        };
        Object.defineProperty(ExploreService_1.prototype, "runningCount", {
            /** J03-7: 空闲态守卫辅助——活动会话数（0 表示无探索在跑） */
            get: function () {
                return this.runningSessions().length;
            },
            enumerable: false,
            configurable: true
        });
        /**
         * J03: 停止探索。带 explorationId 定向停单会话；不带则停所有活动会话（旧全局语义兼容）。
         * 返回实际置位的会话数（0 = 无活动探索，controller 据此返回 400）。
         */
        ExploreService_1.prototype.stop = function (explorationId) {
            var targets = this.resolveTargets(explorationId);
            for (var _i = 0, targets_1 = targets; _i < targets_1.length; _i++) {
                var s = targets_1[_i];
                s.info.stopped = true;
                s.info.paused = false;
            }
            return targets.length;
        };
        /** J03: 暂停/恢复。定向语义同 stop；返回实际生效会话数。 */
        ExploreService_1.prototype.setPaused = function (on, explorationId) {
            var targets = this.resolveTargets(explorationId);
            for (var _i = 0, targets_2 = targets; _i < targets_2.length; _i++) {
                var s = targets_2[_i];
                s.info.paused = on;
            }
            return targets.length;
        };
        ExploreService_1.prototype.resolveTargets = function (explorationId) {
            if (explorationId) {
                var s = this.sessionMap.get(explorationId);
                return s && s.info.finishedAt === null ? [s] : [];
            }
            return this.runningSessions();
        };
        /** J03: 新探索开始时清理过期会话（结束超 30 分钟或超出保留数） */
        ExploreService_1.prototype.pruneSessions = function () {
            var CUT = 30 * 60 * 1000;
            var now = Date.now();
            for (var _i = 0, _a = this.sessionMap; _i < _a.length; _i++) {
                var _b = _a[_i], id = _b[0], s = _b[1];
                if (s.info.finishedAt !== null && now - s.info.finishedAt > CUT)
                    this.sessionMap.delete(id);
            }
            var finished = __spreadArray([], this.sessionMap.entries(), true).filter(function (_a) {
                var s = _a[1];
                return s.info.finishedAt !== null;
            });
            for (var _c = 0, _d = finished.slice(0, Math.max(0, finished.length - 20)); _c < _d.length; _c++) {
                var id = _d[_c][0];
                this.sessionMap.delete(id);
            }
        };
        /** G10: 当前探索的 CDP 接入端点（headless 运行返回 null——诚实暴露） */
        ExploreService_1.prototype.cdpEndpoint = function () {
            return this._cdpEndpoint;
        };
        /**
         * J03: 控制状态——按会话分槽（sessions/runningCount/runningSessions 为新契约），
         * running/currentUrl/pageCount/actCount 等旧单值字段保留（取最新活动会话，空闲时归零不复位残留）。
         * Query 参数（explorationId/since）由 controller 传入用于断线补看。
         */
        ExploreService_1.prototype.controlState = function (query) {
            var _a, _b, _c, _d, _e, _f, _g;
            var running = this.runningSessions();
            var latest = running.length > 0
                ? running[running.length - 1].info
                : (this.latestSessionId ? (_a = this.sessionMap.get(this.latestSessionId)) === null || _a === void 0 ? void 0 : _a.info : undefined);
            // J03-9: 指定会话 + since 游标 → 返回该会话 after-since 的事件（断线补看）
            if (query === null || query === void 0 ? void 0 : query.explorationId) {
                var s = this.sessionMap.get(query.explorationId);
                if (!s)
                    return { found: false, events: [], since: 0 };
                var since = Math.max(0, Math.min((_b = query.since) !== null && _b !== void 0 ? _b : 0, s.events.length));
                return {
                    found: true,
                    running: s.info.finishedAt === null,
                    session: s.info,
                    since: s.events.length,
                    events: s.events.slice(since),
                };
            }
            return {
                // 旧单值字段（兼容：当前最新会话的值）
                running: running.length > 0,
                paused: (_c = latest === null || latest === void 0 ? void 0 : latest.paused) !== null && _c !== void 0 ? _c : false,
                stopped: (_d = latest === null || latest === void 0 ? void 0 : latest.stopped) !== null && _d !== void 0 ? _d : false,
                currentUrl: (_e = latest === null || latest === void 0 ? void 0 : latest.currentUrl) !== null && _e !== void 0 ? _e : '',
                pageCount: (_f = latest === null || latest === void 0 ? void 0 : latest.pageCount) !== null && _f !== void 0 ? _f : 0,
                actCount: (_g = latest === null || latest === void 0 ? void 0 : latest.actCount) !== null && _g !== void 0 ? _g : 0,
                cdpEndpoint: this._cdpEndpoint,
                // J03 新契约：并发隔离
                runningCount: running.length,
                sessions: running.map(function (s) { return s.info; }),
            };
        };
        ExploreService_1.prototype.explore = function (input, onEvent) {
            return __awaiter(this, void 0, void 0, function () {
                var applicationId, startUrl, maxPages, sessionId, session, slot, emit, crawler_1, result, stoppedNote, expl, explorationRowId, store, saved, isEmpty, qaCount, graph, extractor, candidates, deduped, qaStore, ids, err_3, done, err_4, e;
                var _this = this;
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return __generator(this, function (_j) {
                    switch (_j.label) {
                        case 0: return [4 /*yield*/, this.ensurePool()];
                        case 1:
                            _j.sent();
                            return [4 /*yield*/, this.ensureSchemaAndSeed()];
                        case 2:
                            applicationId = _j.sent();
                            startUrl = (_a = input.startUrl) !== null && _a !== void 0 ? _a : "".concat((_b = process.env.EXPLORE_TARGET_URL) !== null && _b !== void 0 ? _b : 'https://qa.tech');
                            maxPages = (_d = (_c = input.maxPages) !== null && _c !== void 0 ? _c : input.maxActions) !== null && _d !== void 0 ? _d : 12;
                            // J03-1/3/6: 会话创建——exp_xxx 标识贯穿事件与 control 分槽；计数器按会话从零计
                            this.pruneSessions();
                            sessionId = "exp_".concat(Math.random().toString(36).slice(2, 8));
                            session = {
                                id: sessionId,
                                startUrl: startUrl,
                                startedAt: Date.now(), currentUrl: startUrl,
                                pageCount: 0, actCount: 0,
                                maxPages: maxPages,
                                paused: false, stopped: false, finishedAt: null,
                            };
                            slot = { info: session, events: [] };
                            this.sessionMap.set(sessionId, slot);
                            this.latestSessionId = sessionId;
                            this._cdpEndpoint = null; // G10: CDP 端点按本次探索实际模式重置
                            emit = function (e) {
                                var stamped = __assign({ explorationId: sessionId }, e);
                                slot.events.push(stamped);
                                if (slot.events.length > 200)
                                    slot.events.splice(0, slot.events.length - 200);
                                onEvent(stamped);
                            };
                            _j.label = 3;
                        case 3:
                            _j.trys.push([3, 15, 16, 17]);
                            emit({ phase: 'crawl', message: "\u5F00\u59CB\u63A2\u7D22 ".concat(startUrl), currentUrl: startUrl });
                            crawler_1 = new agent_core_1.Crawler();
                            return [4 /*yield*/, crawler_1.crawl({
                                    startUrl: startUrl,
                                    maxDepth: (_e = input.maxDepth) !== null && _e !== void 0 ? _e : 2,
                                    maxPages: maxPages,
                                    headful: input.headful, // G10: headful 接管模式透传
                                    intent: input.intent,
                                    credential: input.credential,
                                    llm: this.llm(),
                                    // F4: 增量事件（页粒度）+ 人工接管控制（J03: 按会话读写，多探索互不干扰）
                                    onProgress: function (p) {
                                        var _a, _b, _c, _d, _e;
                                        // G10: 每页循环时同步 crawler 的 CDP 接入点（headful launch 后有值）
                                        _this._cdpEndpoint = crawler_1.cdpEndpoint();
                                        if (p.kind === 'page') {
                                            session.currentUrl = p.url;
                                            session.pageCount += 1;
                                            session.actCount += p.interactive;
                                            emit(__assign({ phase: 'crawl', message: "[\u9875] ".concat(p.title || p.url, "\uFF08\u6DF1\u5EA6 ").concat(p.depth, " \u00B7 ").concat(p.interactive, " \u4EA4\u4E92 \u00B7 ").concat(p.links, " \u94FE\u63A5\uFF09"), currentUrl: p.url, pageTitle: p.title, depth: p.depth, interactive: p.interactive, linkCount: p.links, loginWall: p.loginWall }, (p.loginWall ? { finding: { level: 'amber', title: '登录墙', detail: "".concat(p.url, " \u5B58\u5728\u5BC6\u7801\u8868\u5355\u2014\u2014Agent \u5C06\u5C1D\u8BD5\u7528\u51ED\u636E\u767B\u5F55\uFF08\u65E0\u51ED\u636E\u65F6\u4F1A\u5411\u4F60\u8981\uFF09") } } : {})));
                                            // F4-LF: Live Findings 多类型——HTTP 错误（red）/ 慢响应（amber）/ JS 控制台错误（amber）
                                            if (p.status != null && p.status >= 400) {
                                                emit({
                                                    phase: 'crawl',
                                                    message: "[\u53D1\u73B0] ".concat(p.url, " \u8FD4\u56DE HTTP ").concat(p.status),
                                                    currentUrl: p.url,
                                                    finding: { level: 'red', title: "HTTP ".concat(p.status), detail: "".concat(p.title || p.url, "\uFF08").concat(p.url, "\uFF09\u8FD4\u56DE HTTP ").concat(p.status, "\u2014\u2014\u9875\u9762\u53EF\u80FD\u5DF2\u5931\u6548\u3001\u88AB\u6743\u9650\u62E6\u622A\u6216\u8DEF\u7531\u635F\u574F\uFF0C\u662F Agent \u89C6\u89D2\u7684\u771F\u5B9E\u6545\u969C\u4FE1\u53F7\u3002") },
                                                });
                                            }
                                            if (((_a = p.loadMs) !== null && _a !== void 0 ? _a : 0) > 2500) {
                                                emit({
                                                    phase: 'crawl',
                                                    message: "[\u53D1\u73B0] ".concat(p.url, " \u52A0\u8F7D ").concat((((_b = p.loadMs) !== null && _b !== void 0 ? _b : 0) / 1000).toFixed(1), "s"),
                                                    currentUrl: p.url,
                                                    finding: { level: 'amber', title: '慢响应', detail: "".concat(p.title || p.url, "\uFF08").concat(p.url, "\uFF09\u52A0\u8F7D\u8017\u65F6 ").concat((((_c = p.loadMs) !== null && _c !== void 0 ? _c : 0) / 1000).toFixed(1), "s\uFF08\u9608\u503C 2.5s\uFF09\u2014\u2014\u53EF\u80FD\u5B58\u5728\u6027\u80FD\u9000\u5316\uFF0C\u5EFA\u8BAE\u5173\u6CE8\u9996\u5C4F\u8D44\u6E90\u4E0E\u63A5\u53E3\u8017\u65F6\u3002") },
                                                });
                                            }
                                            if (((_d = p.consoleErrors) !== null && _d !== void 0 ? _d : 0) > 0) {
                                                emit({
                                                    phase: 'crawl',
                                                    message: "[\u53D1\u73B0] ".concat(p.url, " \u51FA\u73B0 ").concat(p.consoleErrors, " \u6761 JS \u9519\u8BEF"),
                                                    currentUrl: p.url,
                                                    finding: { level: 'amber', title: 'JS 控制台错误', detail: "".concat(p.title || p.url, "\uFF08").concat(p.url, "\uFF09\u6E32\u67D3\u671F\u95F4\u6355\u83B7 ").concat(p.consoleErrors, " \u6761 console error / \u672A\u6355\u83B7\u5F02\u5E38\u2014\u2014\u524D\u7AEF\u8FD0\u884C\u65F6\u4E0D\u5065\u5EB7\uFF0C\u53EF\u80FD\u5F71\u54CD\u7528\u6237\u8DEF\u5F84\u3002") },
                                                });
                                            }
                                        }
                                        else if (p.kind === 'takeover') {
                                            // F4-deep: 人工接管恢复——人访问的页面已并入探索队列
                                            emit({
                                                phase: 'crawl',
                                                message: "[\u63A5\u7BA1] \u4EBA\u5DE5\u8BBF\u95EE ".concat(p.urls.length, " \u4E2A\u9875\u9762\u5DF2\u5E76\u5165\u63A2\u7D22\u961F\u5217\uFF1A").concat(p.urls.map(function (u) { return u.replace(/^https?:\/\//, '').slice(0, 40); }).join('、')),
                                                currentUrl: (_e = p.urls[0]) !== null && _e !== void 0 ? _e : session.currentUrl,
                                            });
                                        }
                                        else {
                                            emit({ phase: 'login', message: "[\u767B\u5F55] ".concat(p.message), currentUrl: session.currentUrl });
                                        }
                                    },
                                    control: { isPaused: function () { return session.paused; }, isStopped: function () { return session.stopped; } },
                                })];
                        case 4:
                            result = _j.sent();
                            stoppedNote = session.stopped ? '（人工停止——已爬部分照常落库）' : '';
                            emit({
                                phase: 'login', message: "\u722C\u53D6\u5B8C\u6210\uFF1A".concat(result.pages.length, " \u9875 \u00B7 \u8BA4\u8BC1=").concat(result.authenticated).concat(stoppedNote),
                                pages: result.pages.length, edges: result.edges.length,
                            });
                            return [4 /*yield*/, this.pg.query("INSERT INTO exploration(short_id, application_id, status, intent, start_url, max_depth, max_actions, finished_at)\n         VALUES ($1, $2, 'complete', $3, $4, $5, $6, now()) RETURNING id", [sessionId, applicationId, (_f = input.intent) !== null && _f !== void 0 ? _f : null, startUrl, (_g = input.maxDepth) !== null && _g !== void 0 ? _g : 2, maxPages])];
                        case 5:
                            expl = _j.sent();
                            explorationRowId = expl.rows[0].id;
                            emit({ phase: 'graph', message: 'Coverage Graph 落库…', explorationRowId: explorationRowId });
                            store = new agent_core_1.GraphStore(this.pg);
                            return [4 /*yield*/, store.saveCrawlGraph({
                                    applicationId: applicationId,
                                    result: result,
                                    intent: input.intent, explorationId: explorationRowId,
                                })];
                        case 6:
                            saved = _j.sent();
                            isEmpty = result.pages.length === 0;
                            if (session.stopped) {
                                emit({ phase: 'stopped', stopped: true, message: "\u5DF2\u505C\u6B62\u2014\u2014\u5DF2\u722C ".concat(result.pages.length, " \u9875\u5DF2\u843D\u5E93\uFF0CQA \u63D0\u53D6\u5DF2\u8DF3\u8FC7") });
                            }
                            if (isEmpty) {
                                emit({ phase: 'warning', message: '未爬到任何页面——请检查 startUrl 可达性' });
                            }
                            qaCount = 0;
                            if (!(!session.stopped && !isEmpty)) return [3 /*break*/, 14];
                            emit({ phase: 'qa', message: 'LLM 提取 QA 点候选…', explorationRowId: explorationRowId });
                            return [4 /*yield*/, store.loadGraph(applicationId)];
                        case 7:
                            graph = _j.sent();
                            _j.label = 8;
                        case 8:
                            _j.trys.push([8, 13, , 14]);
                            extractor = new agent_core_1.QaExtractor(this.llm());
                            return [4 /*yield*/, extractor.extract({
                                    applicationName: DEMO_APP.name,
                                    intent: (_h = input.intent) !== null && _h !== void 0 ? _h : '',
                                    nodes: graph.nodes,
                                    edges: graph.edges,
                                    maxCandidates: 6,
                                })];
                        case 9:
                            candidates = _j.sent();
                            return [4 /*yield*/, this.dedupeCandidates(applicationId, candidates)];
                        case 10:
                            deduped = _j.sent();
                            if (deduped.length < candidates.length) {
                                emit({ phase: 'qa', message: "\u5019\u9009\u53BB\u91CD\uFF1A".concat(candidates.length, " \u2192 ").concat(deduped.length, " \u6761"), explorationRowId: explorationRowId });
                            }
                            if (!(deduped.length > 0)) return [3 /*break*/, 12];
                            qaStore = new agent_core_1.QaPointStore(this.pg);
                            return [4 /*yield*/, qaStore.saveCandidates(applicationId, deduped, explorationRowId)];
                        case 11:
                            ids = _j.sent();
                            qaCount = ids.length;
                            _j.label = 12;
                        case 12: return [3 /*break*/, 14];
                        case 13:
                            err_3 = _j.sent();
                            emit({ phase: 'qa', message: "QA \u63D0\u53D6\u5931\u8D25\uFF08\u4E0D\u963B\u585E\uFF09\uFF1A".concat(err_3 instanceof Error ? err_3.message : String(err_3)), explorationRowId: explorationRowId });
                            return [3 /*break*/, 14];
                        case 14:
                            done = __assign(__assign({ phase: 'done', message: "\u63A2\u7D22\u5B8C\u6210\uFF1A".concat(saved.nodes, " \u8282\u70B9 \u00B7 ").concat(saved.edges, " \u8FB9 \u00B7 ").concat(qaCount, " \u6761 QA \u70B9\u5019\u9009").concat(stoppedNote), explorationRowId: explorationRowId, pages: saved.nodes, edges: saved.edges, qaCount: qaCount, visitedUrls: result.pages.map(function (p) { return p.url; }) }, (isEmpty ? { empty: true } : {})), (session.stopped ? { stopped: true } : {}));
                            emit(done);
                            return [2 /*return*/, done];
                        case 15:
                            err_4 = _j.sent();
                            e = { phase: 'error', message: err_4 instanceof Error ? err_4.message : String(err_4) };
                            emit(e);
                            return [2 /*return*/, e];
                        case 16:
                            // J03-3/7: 生命周期终态——会话标记结束（runningCount 归零、旧字段无残留）
                            session.finishedAt = Date.now();
                            return [7 /*endfinally*/];
                        case 17: return [2 /*return*/];
                    }
                });
            });
        };
        /** J03-5: QA 候选去重——批内 title trim 精确去重；与库内 discovered 候选按 path+title 去重（对齐 from-finding 精确匹配语义） */
        ExploreService_1.prototype.dedupeCandidates = function (applicationId, candidates) {
            return __awaiter(this, void 0, void 0, function () {
                var existing, seen, out, batchTitles, _i, candidates_1, c, title, key;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.pg.query("SELECT title, source->>'sourceUrl' AS path FROM qa_point\n       WHERE application_id = $1 AND status = 'discovered'", [applicationId])];
                        case 1:
                            existing = _b.sent();
                            seen = new Set(existing.rows.map(function (r) { var _a, _b; return "".concat(String((_a = r.path) !== null && _a !== void 0 ? _a : '').trim(), "|").concat(String((_b = r.title) !== null && _b !== void 0 ? _b : '').trim()); }));
                            out = [];
                            batchTitles = new Set();
                            for (_i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
                                c = candidates_1[_i];
                                title = c.title.trim();
                                if (batchTitles.has(title))
                                    continue; // 批内 title 精确去重
                                batchTitles.add(title);
                                key = "".concat(((_a = c.sourceUrl) !== null && _a !== void 0 ? _a : '').trim(), "|").concat(title);
                                if (seen.has(key))
                                    continue; // 与库内 discovered 同 path+title 去重
                                seen.add(key);
                                out.push(c);
                            }
                            return [2 /*return*/, out];
                    }
                });
            });
        };
        return ExploreService_1;
    }(_classSuper));
    __setFunctionName(_classThis, "ExploreService");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ExploreService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ExploreService = _classThis;
}();
exports.ExploreService = ExploreService;
