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
exports.RunsService = exports.DEMO_STEPS = void 0;
var common_1 = require("@nestjs/common");
var node_events_1 = require("node:events");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var agent_core_1 = require("@verifyos/agent-core");
var shared_1 = require("@verifyos/shared");
/** 演示步骤（对 fixture 站点）：module 确定性登录 → assertion → ai → assertion */
exports.DEMO_STEPS = [
    {
        id: 'st_01', title: '管理员登录', kind: 'module',
        actions: [
            { type: 'fill', selector: '#username', value: 'admin' },
            { type: 'fill', selector: '#password', value: 'test123' },
            { type: 'click', selector: 'button[type="submit"]' },
        ],
    },
    { id: 'st_02', title: '进入员工列表', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' } },
    { id: 'st_03', title: '打开关于页', kind: 'ai', instruction: '点击页面上的「关于我们」链接' },
    { id: 'st_04', title: '关于页可达', kind: 'assertion', assert: { kind: 'url_contains', value: 'about.html' } },
];
/**
 * RunsService（C1/C4 桥）：真实 Run 执行编排。
 * POST /api/runs 触发 → RunRunner 执行（Stagehand×glm-4.5v）→ 事件经 emitter 交给 Gateway 广播。
 */
var RunsService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = node_events_1.EventEmitter;
    var RunsService = _classThis = /** @class */ (function (_super) {
        __extends(RunsService_1, _super);
        function RunsService_1(exploreSvc, crypto) {
            var _this = _super.call(this) || this;
            _this.exploreSvc = exploreSvc;
            _this.crypto = crypto;
            _this.runner = null;
            _this.fixtureUrl = '';
            _this.evidenceBaseDir = '';
            _this.evidenceStore = null;
            _this.outcomes = new Map();
            return _this;
        }
        RunsService_1.prototype.onModuleInit = function () {
            return __awaiter(this, void 0, void 0, function () {
                var fixtureDir, fixture;
                var _a, _b, _c, _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            fixtureDir = (_a = process.env.FIXTURE_DIR) !== null && _a !== void 0 ? _a : node_path_1.default.resolve(process.cwd(), '../../packages/agent-core/fixtures/site');
                            return [4 /*yield*/, (0, agent_core_1.serveStatic)(fixtureDir)];
                        case 1:
                            fixture = _e.sent();
                            this.fixtureUrl = fixture.url;
                            this.runner = new agent_core_1.RunRunner({
                                apiKey: (_b = process.env.LLM_API_KEY) !== null && _b !== void 0 ? _b : '',
                                baseURL: (_c = process.env.LLM_BASE_URL) !== null && _c !== void 0 ? _c : 'https://open.bigmodel.cn/api/paas/v4',
                                model: (_d = process.env.LLM_MODEL) !== null && _d !== void 0 ? _d : 'glm-4.5v',
                            });
                            console.log("[runs] fixture ready at ".concat(this.fixtureUrl));
                            return [2 /*return*/];
                    }
                });
            });
        };
        RunsService_1.prototype.trigger = function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var runId, t0, startUrl, steps, baseDir, store, runner, exec;
                var _this = this;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            runId = "run_".concat(Date.now().toString(36));
                            t0 = Date.now();
                            startUrl = (_a = input.startUrl) !== null && _a !== void 0 ? _a : "".concat(this.fixtureUrl, "/login.html");
                            return [4 /*yield*/, this.injectCredential((_b = input.steps) !== null && _b !== void 0 ? _b : exports.DEMO_STEPS)];
                        case 1:
                            steps = _d.sent();
                            baseDir = node_path_1.default.resolve(process.cwd(), '../../out/evidence');
                            store = (_c = this.evidenceStore) !== null && _c !== void 0 ? _c : (this.evidenceStore = new agent_core_1.LocalDiskStore(baseDir));
                            this.evidenceBaseDir = baseDir;
                            runner = this.runner;
                            exec = runner
                                ? runner.run({
                                    runId: runId,
                                    startUrl: startUrl,
                                    steps: steps,
                                    device: input.device,
                                    evidenceStore: store,
                                    onEvent: function (e) { return _this.emit('run.event', e); },
                                })
                                : Promise.reject(new Error('RunRunner 未初始化（浏览器/LLM 启动失败），Run 无法执行'));
                            // 异步执行：HTTP 立即返回 runId，事件走 WS 实时推
                            void exec
                                .then(function (outcome) { return __awaiter(_this, void 0, void 0, function () {
                                var err_1;
                                var _a, _b, _c, _d;
                                return __generator(this, function (_e) {
                                    switch (_e.label) {
                                        case 0:
                                            _e.trys.push([0, 3, , 4]);
                                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                                        case 1:
                                            _e.sent();
                                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO run(short_id, target, trigger, verification_id, verdict, duration_ms, failure_summary, output, finished_at)\n             VALUES ($1, $2::jsonb, $7, (SELECT id FROM verification WHERE short_id = $8 LIMIT 1), $3, $4, $5, $6::jsonb, now())", [
                                                    runId,
                                                    JSON.stringify({ applicationShortId: 'app_demo', platform: 'web', environment: { url: startUrl, isPreview: false } }),
                                                    outcome.verdict,
                                                    outcome.durationMs,
                                                    (_a = outcome.failureSummary) !== null && _a !== void 0 ? _a : null,
                                                    JSON.stringify({ llmCalls: outcome.llmCalls, cache: outcome.cache, stepCount: outcome.stepResults.length, device: (_b = input.device) !== null && _b !== void 0 ? _b : null, evidenceKeys: outcome.evidenceKeys, visitedUrls: outcome.visitedUrls, reachability: outcome.reachability, events: outcome.events }),
                                                    (_c = input.trigger) !== null && _c !== void 0 ? _c : 'manual',
                                                    (_d = input.verificationShortId) !== null && _d !== void 0 ? _d : null,
                                                ])];
                                        case 2:
                                            _e.sent();
                                            return [3 /*break*/, 4];
                                        case 3:
                                            err_1 = _e.sent();
                                            console.error('[runs] 落库失败（不影响 Run 结果）：', err_1 instanceof Error ? err_1.message : err_1);
                                            return [3 /*break*/, 4];
                                        case 4:
                                            this.outcomes.set(runId, outcome);
                                            this.emit('run.done', {
                                                runId: runId,
                                                verdict: outcome.verdict,
                                                llmCalls: outcome.llmCalls,
                                                cache: outcome.cache,
                                                durationMs: outcome.durationMs,
                                            });
                                            return [2 /*return*/];
                                    }
                                });
                            }); })
                                .catch(function (err) { return __awaiter(_this, void 0, void 0, function () {
                                var message, durationMs, verdict, target, events, outcome, pgErr_1;
                                var _a, _b, _c;
                                return __generator(this, function (_d) {
                                    switch (_d.label) {
                                        case 0:
                                            message = err instanceof Error ? err.message : String(err);
                                            durationMs = Date.now() - t0;
                                            verdict = 'fail';
                                            target = {
                                                applicationShortId: 'app_demo',
                                                platform: 'web',
                                                environment: { url: startUrl, isPreview: false },
                                            };
                                            events = [
                                                shared_1.ev.runStarted(runId, target),
                                                shared_1.ev.runCompleted(runId, verdict, { error: message }, message),
                                            ];
                                            outcome = {
                                                verdict: verdict,
                                                events: events,
                                                failureSummary: message,
                                                llmCalls: 0,
                                                cache: { entries: 0, totalHits: 0 },
                                                stepResults: [],
                                                durationMs: durationMs,
                                                evidenceKeys: [],
                                                visitedUrls: [],
                                                reachability: [],
                                            };
                                            this.outcomes.set(runId, outcome);
                                            _d.label = 1;
                                        case 1:
                                            _d.trys.push([1, 4, , 5]);
                                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                                        case 2:
                                            _d.sent();
                                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO run(short_id, target, trigger, verification_id, verdict, duration_ms, failure_summary, output, finished_at)\n             VALUES ($1, $2::jsonb, $7, (SELECT id FROM verification WHERE short_id = $8 LIMIT 1), $3, $4, $5, $6::jsonb, now())", [
                                                    runId,
                                                    JSON.stringify({ applicationShortId: 'app_demo', platform: 'web', environment: { url: startUrl, isPreview: false } }),
                                                    verdict,
                                                    durationMs,
                                                    message,
                                                    JSON.stringify({ llmCalls: 0, cache: outcome.cache, stepCount: 0, device: (_a = input.device) !== null && _a !== void 0 ? _a : null, evidenceKeys: [], visitedUrls: [], reachability: [], error: message, events: events }),
                                                    (_b = input.trigger) !== null && _b !== void 0 ? _b : 'manual',
                                                    (_c = input.verificationShortId) !== null && _c !== void 0 ? _c : null,
                                                ])];
                                        case 3:
                                            _d.sent();
                                            return [3 /*break*/, 5];
                                        case 4:
                                            pgErr_1 = _d.sent();
                                            console.error('[runs] 异常 Run 落库失败：', pgErr_1 instanceof Error ? pgErr_1.message : pgErr_1);
                                            return [3 /*break*/, 5];
                                        case 5:
                                            this.emit('run.event', events[1]); // run.completed（前端停止转圈的终态事件）
                                            this.emit('run.done', {
                                                runId: runId,
                                                verdict: verdict,
                                                llmCalls: 0,
                                                cache: outcome.cache,
                                                durationMs: durationMs,
                                            });
                                            return [2 /*return*/];
                                    }
                                });
                            }); });
                            return [2 /*return*/, { runId: runId }];
                    }
                });
            });
        };
        /** 从凭据库取角色凭据注入登录步骤（fallback：默认演示凭据） */
        RunsService_1.prototype.injectCredential = function (steps) {
            return __awaiter(this, void 0, void 0, function () {
                var username, password, r, vals, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            username = 'admin';
                            password = 'test123';
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            _b.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT payload_enc FROM credential WHERE role = '\u7BA1\u7406\u5458' ORDER BY created_at DESC LIMIT 1")];
                        case 3:
                            r = _b.sent();
                            if (r.rows.length > 0) {
                                vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc));
                                if (vals.username)
                                    username = vals.username;
                                if (vals.password)
                                    password = vals.password;
                            }
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _b.sent();
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/, steps.map(function (s) {
                                var _a;
                                return (__assign(__assign({}, s), { actions: (_a = s.actions) === null || _a === void 0 ? void 0 : _a.map(function (a) {
                                        if (a.type === 'fill' && a.selector === '#username')
                                            return __assign(__assign({}, a), { value: username });
                                        if (a.type === 'fill' && a.selector === '#password')
                                            return __assign(__assign({}, a), { value: password });
                                        return a;
                                    }) }));
                            })];
                    }
                });
            });
        };
        RunsService_1.prototype.get = function (runId) {
            return this.outcomes.get(runId);
        };
        Object.defineProperty(RunsService_1.prototype, "fixtureEntryUrl", {
            /** D3：当前 fixture 入口 URL（webhook stub 的 preview 目标） */
            get: function () {
                return "".concat(this.fixtureUrl, "/login.html");
            },
            enumerable: false,
            configurable: true
        });
        /** E2：全部已完成 Run（内存，供概览聚合） */
        RunsService_1.prototype.all = function () {
            return __spreadArray([], this.outcomes.entries(), true).map(function (_a) {
                var runId = _a[0], o = _a[1];
                return ({
                    runId: runId,
                    verdict: o.verdict, durationMs: o.durationMs, llmCalls: o.llmCalls,
                });
            });
        };
        /** 证据 key → 本地文件绝对路径（目录穿越防护）；无 store 时返回 null */
        RunsService_1.prototype.evidencePath = function (key) {
            if (!this.evidenceBaseDir)
                return null;
            var file = node_path_1.default.resolve(this.evidenceBaseDir, key);
            if (!file.startsWith(node_path_1.default.resolve(this.evidenceBaseDir) + node_path_1.default.sep))
                return null;
            if (!node_fs_1.default.existsSync(file) || node_fs_1.default.statSync(file).isDirectory())
                return null;
            return file;
        };
        /** J04：某 run 的证据列表（对照磁盘 out/evidence/<runId>/ 枚举）；目录不存在返回 null（用于区分「run 不存在」与「无证据」） */
        RunsService_1.prototype.evidenceList = function (runId) {
            if (!this.evidenceBaseDir)
                return null;
            var dir = node_path_1.default.resolve(this.evidenceBaseDir, runId);
            // 目录穿越防护：runId 只能是 baseDir 下的一级目录
            if (!dir.startsWith(node_path_1.default.resolve(this.evidenceBaseDir) + node_path_1.default.sep))
                return null;
            if (!node_fs_1.default.existsSync(dir) || !node_fs_1.default.statSync(dir).isDirectory())
                return null;
            var out = [];
            var kindOf = function (name) {
                if (name.startsWith('screenshot') || name.endsWith('.png'))
                    return 'screenshot';
                if (name.startsWith('trace') || name.endsWith('.zip'))
                    return 'trace';
                if (name.startsWith('network') || name.endsWith('.har'))
                    return 'har';
                if (name.endsWith('.log') || name.endsWith('.txt'))
                    return 'console';
                return 'file';
            };
            var walk = function (d, prefix) {
                if (prefix === void 0) { prefix = ''; }
                for (var _i = 0, _a = node_fs_1.default.readdirSync(d); _i < _a.length; _i++) {
                    var f = _a[_i];
                    var full = node_path_1.default.join(d, f);
                    if (node_fs_1.default.statSync(full).isDirectory())
                        walk(full, "".concat(prefix).concat(f, "/"));
                    else
                        out.push({ key: "".concat(runId, "/").concat(prefix).concat(f), kind: kindOf(f), bytes: node_fs_1.default.statSync(full).size });
                }
            };
            walk(dir);
            return out;
        };
        return RunsService_1;
    }(_classSuper));
    __setFunctionName(_classThis, "RunsService");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RunsService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RunsService = _classThis;
}();
exports.RunsService = RunsService;
