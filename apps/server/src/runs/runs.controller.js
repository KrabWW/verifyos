"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunsController = void 0;
var common_1 = require("@nestjs/common");
var runs_service_1 = require("./runs.service");
var RunsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/runs')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _steps_decorators;
    var _trigger_decorators;
    var _events_decorators;
    var _get_decorators;
    var _evidence_decorators;
    var _report_decorators;
    var RunsController = _classThis = /** @class */ (function () {
        function RunsController_1(runs, exploreSvc) {
            this.runs = (__runInitializers(this, _instanceExtraInitializers), runs);
            this.exploreSvc = exploreSvc;
        }
        /** 步骤定义（前端三列页左列） */
        RunsController_1.prototype.steps = function () {
            return { steps: runs_service_1.DEMO_STEPS };
        };
        RunsController_1.prototype.trigger = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.runs.trigger({ startUrl: body === null || body === void 0 ? void 0 : body.startUrl, steps: body === null || body === void 0 ? void 0 : body.steps, device: body === null || body === void 0 ? void 0 : body.device, verificationShortId: body === null || body === void 0 ? void 0 : body.verificationShortId })];
                });
            });
        };
        /** 历史 Run 事件流回放（从 PG output->events 读） */
        RunsController_1.prototype.events = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var o, r, events, _a;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            o = this.runs.get(id);
                            if (o)
                                return [2 /*return*/, { found: true, events: o.events, source: 'memory' }];
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            _d.sent(); // 懒初始化连接池（否则 pool 未初始化会抛错）
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT output FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 3:
                            r = _d.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            events = ((_c = (_b = r.rows[0].output) === null || _b === void 0 ? void 0 : _b.events) !== null && _c !== void 0 ? _c : []);
                            return [2 /*return*/, { found: true, events: events, source: 'pg' }];
                        case 4:
                            _a = _d.sent();
                            return [2 /*return*/, { found: false }];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        };
        /** Run 结果（含 C3 触达校验明细）；内存 miss 后 PG 回退（重启后的历史 Run，对照 events 端点模式） */
        RunsController_1.prototype.get = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var o, r, row, output, events, stepResults, failedStep, _a;
                var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                return __generator(this, function (_o) {
                    switch (_o.label) {
                        case 0:
                            o = this.runs.get(id);
                            if (o) {
                                return [2 /*return*/, {
                                        found: true,
                                        verdict: o.verdict,
                                        llmCalls: o.llmCalls,
                                        cache: o.cache,
                                        durationMs: o.durationMs,
                                        failedStep: o.failedStep,
                                        failureSummary: o.failureSummary,
                                        stepResults: o.stepResults,
                                        visitedUrls: o.visitedUrls,
                                        reachability: o.reachability,
                                        evidenceKeys: o.evidenceKeys,
                                    }];
                            }
                            _o.label = 1;
                        case 1:
                            _o.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            _o.sent(); // 懒初始化连接池（否则 pool 未初始化会抛错）
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT verdict, duration_ms, failure_summary, output FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 3:
                            r = _o.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            row = r.rows[0];
                            output = (_b = row.output) !== null && _b !== void 0 ? _b : {};
                            events = (_c = output.events) !== null && _c !== void 0 ? _c : [];
                            stepResults = events
                                .filter(function (e) { return e.type === 'step.completed' && e.stepId; })
                                .map(function (e) { var _a, _b, _c, _d; return ({ id: e.stepId, verdict: (_a = e.verdict) !== null && _a !== void 0 ? _a : 'unknown', llmCalls: (_b = e.llmCalls) !== null && _b !== void 0 ? _b : 0, cacheHit: (_c = e.cacheHit) !== null && _c !== void 0 ? _c : false, durationMs: (_d = e.durationMs) !== null && _d !== void 0 ? _d : 0 }); });
                            failedStep = (_d = events.find(function (e) { return e.type === 'step.completed' && e.verdict === 'fail'; })) === null || _d === void 0 ? void 0 : _d.stepId;
                            return [2 /*return*/, {
                                    found: true,
                                    verdict: (_e = row.verdict) !== null && _e !== void 0 ? _e : 'unknown',
                                    llmCalls: (_f = output.llmCalls) !== null && _f !== void 0 ? _f : 0,
                                    cache: (_g = output.cache) !== null && _g !== void 0 ? _g : { entries: 0, totalHits: 0 },
                                    durationMs: (_h = row.duration_ms) !== null && _h !== void 0 ? _h : 0,
                                    failedStep: failedStep,
                                    failureSummary: (_j = row.failure_summary) !== null && _j !== void 0 ? _j : undefined,
                                    stepResults: stepResults,
                                    visitedUrls: (_k = output.visitedUrls) !== null && _k !== void 0 ? _k : [],
                                    reachability: (_l = output.reachability) !== null && _l !== void 0 ? _l : [],
                                    evidenceKeys: (_m = output.evidenceKeys) !== null && _m !== void 0 ? _m : [],
                                }];
                        case 4:
                            _a = _o.sent();
                            return [2 /*return*/, { found: false }];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        };
        /** 证据端点：无 key → 证据列表 {found,runId,keys:[{key,kind,bytes}]}（J04，对照磁盘 out/evidence/<runId>/ 枚举）；
         *  有 key → 单文件下钻（/api/runs/:id/evidence?key=<key>；key 含 / 用 query 传，通配路由 Nest11/Express5 不兼容，Triage/执行页在用） */
        RunsController_1.prototype.evidence = function (id, key, res) {
            return __awaiter(this, void 0, void 0, function () {
                var keys, existsMem, existsPg, r, _a, file;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!!key) return [3 /*break*/, 7];
                            keys = this.runs.evidenceList(id);
                            if (!(keys === null)) return [3 /*break*/, 6];
                            existsMem = this.runs.get(id) !== undefined;
                            existsPg = false;
                            if (!!existsMem) return [3 /*break*/, 5];
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            _b.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT 1 FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 3:
                            r = _b.sent();
                            existsPg = r.rows.length > 0;
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _b.sent();
                            existsPg = false;
                            return [3 /*break*/, 5];
                        case 5:
                            if (!existsMem && !existsPg)
                                return [2 /*return*/, res.status(404).json({ error: 'run not found' })];
                            return [2 /*return*/, res.json({ found: true, runId: id, keys: [] })];
                        case 6: return [2 /*return*/, res.json({ found: true, runId: id, keys: keys })];
                        case 7:
                            file = this.runs.evidencePath(key);
                            if (!file)
                                return [2 /*return*/, res.status(404).json({ error: 'not found' })];
                            res.sendFile(file);
                            return [2 /*return*/];
                    }
                });
            });
        };
        /** Run 报告导出（Markdown）：内存命中全量明细；PG 回退从 events 重建步骤表 */
        RunsController_1.prototype.report = function (id, res) {
            return __awaiter(this, void 0, void 0, function () {
                var mem, verdict, durationMs, llmCalls, cache, failureSummary, steps, visitedUrls, reachability, evidenceKeys, device, source, r, row, output, events, _a, icon, lines, _i, reachability_1, r0, _b, visitedUrls_1, u, _c, evidenceKeys_1, k;
                var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
                return __generator(this, function (_q) {
                    switch (_q.label) {
                        case 0:
                            mem = this.runs.get(id);
                            verdict = 'unknown';
                            durationMs = 0;
                            llmCalls = 0;
                            cache = { entries: 0, totalHits: 0 };
                            steps = [];
                            visitedUrls = [];
                            reachability = [];
                            evidenceKeys = [];
                            device = null;
                            source = 'memory';
                            if (!mem) return [3 /*break*/, 1];
                            verdict = mem.verdict;
                            durationMs = mem.durationMs;
                            llmCalls = mem.llmCalls;
                            cache = mem.cache;
                            failureSummary = mem.failureSummary;
                            steps = mem.stepResults.map(function (s) { return ({ id: s.id, verdict: s.verdict, llmCalls: s.llmCalls, cacheHit: s.cacheHit, durationMs: s.durationMs }); });
                            visitedUrls = mem.visitedUrls;
                            reachability = mem.reachability;
                            evidenceKeys = mem.evidenceKeys;
                            return [3 /*break*/, 5];
                        case 1:
                            _q.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            _q.sent(); // 懒初始化连接池（否则 pool 未初始化会抛错）
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT verdict, duration_ms, failure_summary, output FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 3:
                            r = _q.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, res.status(404).json({ error: 'run not found' })];
                            row = r.rows[0];
                            output = (_d = row.output) !== null && _d !== void 0 ? _d : {};
                            verdict = (_e = row.verdict) !== null && _e !== void 0 ? _e : 'unknown';
                            durationMs = (_f = row.duration_ms) !== null && _f !== void 0 ? _f : 0;
                            failureSummary = (_g = row.failure_summary) !== null && _g !== void 0 ? _g : undefined;
                            llmCalls = (_h = output.llmCalls) !== null && _h !== void 0 ? _h : 0;
                            cache = (_j = output.cache) !== null && _j !== void 0 ? _j : { entries: 0, totalHits: 0 };
                            device = (_k = output.device) !== null && _k !== void 0 ? _k : null;
                            evidenceKeys = (_l = output.evidenceKeys) !== null && _l !== void 0 ? _l : [];
                            visitedUrls = (_m = output.visitedUrls) !== null && _m !== void 0 ? _m : [];
                            reachability = (_o = output.reachability) !== null && _o !== void 0 ? _o : [];
                            events = (_p = output.events) !== null && _p !== void 0 ? _p : [];
                            steps = events
                                .filter(function (e) { return e.type === 'step.completed' && e.stepId; })
                                .map(function (e) { var _a, _b, _c, _d; return ({ id: e.stepId, verdict: (_a = e.verdict) !== null && _a !== void 0 ? _a : 'unknown', llmCalls: (_b = e.llmCalls) !== null && _b !== void 0 ? _b : 0, cacheHit: (_c = e.cacheHit) !== null && _c !== void 0 ? _c : false, durationMs: (_d = e.durationMs) !== null && _d !== void 0 ? _d : 0 }); });
                            source = 'pg';
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _q.sent();
                            return [2 /*return*/, res.status(404).json({ error: 'run not found' })];
                        case 5:
                            icon = function (v) { return (v === 'pass' ? '✅' : v === 'fail' ? '❌' : '⚠️'); };
                            lines = [];
                            lines.push("# VerifyOS Run \u62A5\u544A \u00B7 ".concat(id));
                            lines.push('');
                            lines.push("> \u6765\u6E90\uFF1A".concat(source === 'memory' ? '实时执行结果' : 'PG 历史归档（events 重建）', " \u00B7 \u751F\u6210\u65F6\u95F4 ").concat(new Date().toISOString()));
                            lines.push('');
                            lines.push("## \u7ED3\u8BBA");
                            lines.push('');
                            lines.push("| \u6307\u6807 | \u503C |");
                            lines.push("| --- | --- |");
                            lines.push("| \u5224\u5B9A | ".concat(icon(verdict), " ").concat(verdict.toUpperCase(), " |"));
                            lines.push("| \u8017\u65F6 | ".concat((durationMs / 1000).toFixed(1), "s |"));
                            lines.push("| LLM \u8C03\u7528 | ".concat(llmCalls, " \u6B21 |"));
                            lines.push("| \u5B9A\u4F4D\u7F13\u5B58 | ".concat(cache.entries, " \u6761 / \u547D\u4E2D ").concat(cache.totalHits, " \u6B21 |"));
                            if (device)
                                lines.push("| \u8BBE\u5907 | ".concat(device, " |"));
                            lines.push("| \u8BC1\u636E\u6587\u4EF6 | ".concat(evidenceKeys.length, " \u4E2A |"));
                            lines.push('');
                            if (failureSummary) {
                                lines.push("**\u5931\u8D25\u6458\u8981**\uFF1A".concat(failureSummary));
                                lines.push('');
                            }
                            lines.push("## \u6B65\u9AA4\u660E\u7EC6\uFF08".concat(steps.length, "\uFF09"));
                            lines.push('');
                            lines.push("| # | \u6B65\u9AA4 | \u5224\u5B9A | LLM | \u7F13\u5B58 | \u8017\u65F6 |");
                            lines.push("| --- | --- | --- | --- | --- | --- |");
                            steps.forEach(function (s, i) {
                                lines.push("| ".concat(i + 1, " | ").concat(s.id, " | ").concat(icon(s.verdict), " ").concat(s.verdict, " | ").concat(s.llmCalls, " | ").concat(s.cacheHit ? '命中' : '-', " | ").concat((s.durationMs / 1000).toFixed(1), "s |"));
                            });
                            lines.push('');
                            if (reachability.length > 0) {
                                lines.push("## \u89E6\u8FBE\u6821\u9A8C\uFF08UNKNOWN \u2260 PASS\uFF09");
                                lines.push('');
                                lines.push("| \u6B65\u9AA4 | \u5224\u5B9A | \u8BF4\u660E |");
                                lines.push("| --- | --- | --- |");
                                for (_i = 0, reachability_1 = reachability; _i < reachability_1.length; _i++) {
                                    r0 = reachability_1[_i];
                                    lines.push("| ".concat(r0.stepId, " | ").concat(icon(r0.verdict), " ").concat(r0.verdict, " | ").concat(r0.explanation).concat(r0.matchedUrl ? "\uFF08\u547D\u4E2D ".concat(r0.matchedUrl, "\uFF09") : '', " |"));
                                }
                                lines.push('');
                            }
                            if (visitedUrls.length > 0) {
                                lines.push("## \u5B9E\u9645\u89E6\u8FBE URL\uFF08".concat(visitedUrls.length, "\uFF09"));
                                lines.push('');
                                for (_b = 0, visitedUrls_1 = visitedUrls; _b < visitedUrls_1.length; _b++) {
                                    u = visitedUrls_1[_b];
                                    lines.push("- ".concat(u));
                                }
                                lines.push('');
                            }
                            if (evidenceKeys.length > 0) {
                                lines.push("## \u8BC1\u636E\u9644\u4EF6");
                                lines.push('');
                                lines.push("\u9644\u4EF6\u968F\u62A5\u544A\u4E00\u5E76\u5F52\u6863\uFF08\u5171 ".concat(evidenceKeys.length, " \u4E2A\uFF09\uFF1A"));
                                lines.push('');
                                for (_c = 0, evidenceKeys_1 = evidenceKeys; _c < evidenceKeys_1.length; _c++) {
                                    k = evidenceKeys_1[_c];
                                    lines.push("- `".concat(k, "`"));
                                }
                                lines.push('');
                            }
                            lines.push("---");
                            lines.push("*Generated by VerifyOS*");
                            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
                            res.setHeader('Content-Disposition', "attachment; filename=\"".concat(id, "-report.md\""));
                            res.send(lines.join('\n'));
                            return [2 /*return*/];
                    }
                });
            });
        };
        return RunsController_1;
    }());
    __setFunctionName(_classThis, "RunsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _steps_decorators = [(0, common_1.Get)('steps')];
        _trigger_decorators = [(0, common_1.Post)()];
        _events_decorators = [(0, common_1.Get)(':id/events')];
        _get_decorators = [(0, common_1.Get)(':id')];
        _evidence_decorators = [(0, common_1.Get)(':id/evidence')];
        _report_decorators = [(0, common_1.Get)(':id/report')];
        __esDecorate(_classThis, null, _steps_decorators, { kind: "method", name: "steps", static: false, private: false, access: { has: function (obj) { return "steps" in obj; }, get: function (obj) { return obj.steps; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _trigger_decorators, { kind: "method", name: "trigger", static: false, private: false, access: { has: function (obj) { return "trigger" in obj; }, get: function (obj) { return obj.trigger; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _events_decorators, { kind: "method", name: "events", static: false, private: false, access: { has: function (obj) { return "events" in obj; }, get: function (obj) { return obj.events; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: function (obj) { return "get" in obj; }, get: function (obj) { return obj.get; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _evidence_decorators, { kind: "method", name: "evidence", static: false, private: false, access: { has: function (obj) { return "evidence" in obj; }, get: function (obj) { return obj.evidence; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _report_decorators, { kind: "method", name: "report", static: false, private: false, access: { has: function (obj) { return "report" in obj; }, get: function (obj) { return obj.report; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RunsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RunsController = _classThis;
}();
exports.RunsController = RunsController;
