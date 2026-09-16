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
exports.OverviewController = void 0;
var common_1 = require("@nestjs/common");
var shared_1 = require("@verifyos/shared");
/** E2：概览 API（从 PostgreSQL 聚合——重启不丢） */
var OverviewController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/overview')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _overview_decorators;
    var OverviewController = _classThis = /** @class */ (function () {
        function OverviewController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        OverviewController_1.prototype.overview = function (recentLimit) {
            return __awaiter(this, void 0, void 0, function () {
                var rl, stats, recent, qa, trend, prRuns, uncoveredHigh, highNodes, vers, pathOf_1, covered_1, _i, _a, v, _b, _c, s_1, e_1, s, coveragePct, coverageTrend, coveragePaths, pathOf_2, nodes, vers, nodeRows, verRows_1, coveredOf_1, byPath, _d, nodeRows_1, n, p, ms, cur, nowCovered_1, pathEntries_1, DAY, today, days, i, d, e_2;
                var _e, _f;
                return __generator(this, function (_g) {
                    switch (_g.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _g.sent();
                            rl = Math.min(200, Math.max(1, Number(recentLimit) || 8));
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT\n         count(*)::int AS total,\n         count(*) FILTER (WHERE verdict = 'pass')::int AS passed,\n         count(*) FILTER (WHERE verdict = 'unknown')::int AS unknown,\n         count(*) FILTER (WHERE verdict = 'fail')::int AS failed\n       FROM run")];
                        case 2:
                            stats = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT r.short_id, r.verdict, r.duration_ms, (r.output->>'llmCalls')::int AS llm_calls, r.created_at, r.output, r.trigger,\n              v.short_id AS ver_short_id, v.title AS ver_title\n       FROM run r LEFT JOIN verification v ON v.id = r.verification_id\n       ORDER BY r.id DESC LIMIT $1", [rl])];
                        case 3:
                            recent = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT count(*)::int AS n FROM qa_point")];
                        case 4:
                            qa = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT to_char(created_at, 'MM-DD') AS day, min(created_at)::date AS d,\n              count(*) FILTER (WHERE verdict = 'pass')::int AS pass,\n              count(*) FILTER (WHERE verdict = 'unknown')::int AS unknown,\n              count(*) FILTER (WHERE verdict = 'fail')::int AS fail\n       FROM run WHERE created_at > now() - interval '14 days'\n       GROUP BY 1, created_at::date ORDER BY 2")];
                        case 5:
                            trend = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT count(*)::int AS n FROM run WHERE trigger = 'pr'")];
                        case 6:
                            prRuns = _g.sent();
                            uncoveredHigh = [];
                            _g.label = 7;
                        case 7:
                            _g.trys.push([7, 10, , 11]);
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT ref, title FROM graph_node WHERE application_id = 1 AND type = 'page' AND meta->>'intentBand' = 'high'")];
                        case 8:
                            highNodes = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT steps FROM verification")];
                        case 9:
                            vers = _g.sent();
                            pathOf_1 = function (u) { return (u !== null && u !== void 0 ? u : '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, ''); };
                            covered_1 = new Set();
                            for (_i = 0, _a = vers.rows; _i < _a.length; _i++) {
                                v = _a[_i];
                                for (_b = 0, _c = (_e = v.steps) !== null && _e !== void 0 ? _e : []; _b < _c.length; _b++) {
                                    s_1 = _c[_b];
                                    if (s_1.targetRef)
                                        covered_1.add(pathOf_1(s_1.targetRef));
                                    if (((_f = s_1.assert) === null || _f === void 0 ? void 0 : _f.kind) === 'url_contains' && s_1.assert.value)
                                        covered_1.add(pathOf_1(s_1.assert.value));
                                }
                            }
                            uncoveredHigh = highNodes.rows
                                .filter(function (n) { return !covered_1.has(pathOf_1(n.ref)); })
                                .map(function (n) { return ({ path: pathOf_1(n.ref) || '/', title: n.title }); })
                                // J02：同 path 多端口重复节点只报一次
                                .filter(function (n, i, arr) { return arr.findIndex(function (m) { return m.path === n.path; }) === i; });
                            return [3 /*break*/, 11];
                        case 10:
                            e_1 = _g.sent();
                            console.warn('[overview] uncoveredHigh 计算失败:', e_1 instanceof Error ? e_1.message : e_1);
                            return [3 /*break*/, 11];
                        case 11:
                            s = stats.rows[0];
                            coveragePct = 0;
                            coverageTrend = [];
                            coveragePaths = [];
                            _g.label = 12;
                        case 12:
                            _g.trys.push([12, 15, , 16]);
                            pathOf_2 = function (u) { return (u !== null && u !== void 0 ? u : '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, ''); };
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT ref, created_at FROM graph_node WHERE application_id = 1 AND type = 'page' ORDER BY created_at")];
                        case 13:
                            nodes = _g.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT steps, created_at FROM verification ORDER BY created_at")];
                        case 14:
                            vers = _g.sent();
                            nodeRows = nodes.rows;
                            verRows_1 = vers.rows;
                            coveredOf_1 = function (uptoMs) {
                                var _a, _b;
                                var covered = new Set();
                                for (var _i = 0, verRows_2 = verRows_1; _i < verRows_2.length; _i++) {
                                    var v = verRows_2[_i];
                                    if (new Date(v.created_at).getTime() > uptoMs)
                                        continue;
                                    for (var _c = 0, _d = (_a = v.steps) !== null && _a !== void 0 ? _a : []; _c < _d.length; _c++) {
                                        var st = _d[_c];
                                        if (st.targetRef)
                                            covered.add(pathOf_2(st.targetRef));
                                        if (((_b = st.assert) === null || _b === void 0 ? void 0 : _b.kind) === 'url_contains' && st.assert.value)
                                            covered.add(pathOf_2(st.assert.value));
                                    }
                                }
                                return covered;
                            };
                            byPath = new Map();
                            for (_d = 0, nodeRows_1 = nodeRows; _d < nodeRows_1.length; _d++) {
                                n = nodeRows_1[_d];
                                p = pathOf_2(n.ref);
                                ms = new Date(n.created_at).getTime();
                                cur = byPath.get(p);
                                if (cur) {
                                    cur.firstMs = Math.min(cur.firstMs, ms);
                                    cur.refs.push(n.ref);
                                }
                                else {
                                    byPath.set(p, { firstMs: ms, refs: [n.ref] });
                                }
                            }
                            nowCovered_1 = coveredOf_1(Date.now());
                            pathEntries_1 = __spreadArray([], byPath.entries(), true);
                            coveragePct = pathEntries_1.length
                                ? Math.round((pathEntries_1.filter(function (_a) {
                                    var p = _a[0];
                                    return nowCovered_1.has(p);
                                }).length / pathEntries_1.length) * 100)
                                : 0;
                            coveragePaths = pathEntries_1
                                .map(function (_a) {
                                var p = _a[0], firstMs = _a[1].firstMs;
                                return ({ path: p || '/', covered: nowCovered_1.has(p), firstSeenAt: new Date(firstMs) });
                            })
                                .sort(function (a, b) { return a.path.localeCompare(b.path); });
                            DAY = 86400e3;
                            today = new Date();
                            today.setHours(23, 59, 59, 999);
                            days = [];
                            for (i = 55; i >= 0; i--) {
                                d = new Date(today.getTime() - i * DAY);
                                days.push({ day: "".concat(String(d.getMonth() + 1).padStart(2, '0'), "-").concat(String(d.getDate()).padStart(2, '0')), uptoMs: d.getTime() });
                            }
                            coverageTrend = days.map(function (_a) {
                                var day = _a.day, uptoMs = _a.uptoMs;
                                var covered = coveredOf_1(uptoMs);
                                var paths = pathEntries_1.filter(function (_a) {
                                    var firstMs = _a[1].firstMs;
                                    return firstMs <= uptoMs;
                                });
                                var matched = paths.filter(function (_a) {
                                    var p = _a[0];
                                    return covered.has(p);
                                }).length;
                                return { day: day, pct: paths.length ? Math.round((matched / paths.length) * 100) : 0 };
                            });
                            return [3 /*break*/, 16];
                        case 15:
                            e_2 = _g.sent();
                            console.warn('[overview] coverage 计算失败:', e_2 instanceof Error ? e_2.message : e_2);
                            return [3 /*break*/, 16];
                        case 16: return [2 /*return*/, {
                                tools: { total: shared_1.BUILTIN_TOOLS.length },
                                qaPoints: qa.rows[0].n,
                                runs: { total: s.total, passed: s.passed, unknown: s.unknown, failed: s.failed },
                                recent: recent.rows.map(function (r) {
                                    var _a, _b, _c, _d, _e, _f, _g;
                                    return ({
                                        runId: r.short_id,
                                        verdict: r.verdict,
                                        durationMs: Number((_a = r.duration_ms) !== null && _a !== void 0 ? _a : 0),
                                        llmCalls: (_b = r.llm_calls) !== null && _b !== void 0 ? _b : 0,
                                        createdAt: r.created_at,
                                        device: (_d = (_c = r.output) === null || _c === void 0 ? void 0 : _c.device) !== null && _d !== void 0 ? _d : null,
                                        trigger: (_e = r.trigger) !== null && _e !== void 0 ? _e : 'manual',
                                        verShortId: (_f = r.ver_short_id) !== null && _f !== void 0 ? _f : null,
                                        verTitle: (_g = r.ver_title) !== null && _g !== void 0 ? _g : null,
                                    });
                                }),
                                trend: trend.rows,
                                prRuns: prRuns.rows[0].n,
                                uncoveredHigh: uncoveredHigh,
                                coveragePct: coveragePct,
                                coverageTrend: coverageTrend,
                                // J02：path 维度汇总（raw 节点仍可在 /api/graph 查询；此处分母按 path 去重）
                                coveragePaths: coveragePaths,
                            }];
                    }
                });
            });
        };
        return OverviewController_1;
    }());
    __setFunctionName(_classThis, "OverviewController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _overview_decorators = [(0, common_1.Get)()];
        __esDecorate(_classThis, null, _overview_decorators, { kind: "method", name: "overview", static: false, private: false, access: { has: function (obj) { return "overview" in obj; }, get: function (obj) { return obj.overview; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        OverviewController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return OverviewController = _classThis;
}();
exports.OverviewController = OverviewController;
