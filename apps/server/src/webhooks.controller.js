"use strict";
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
exports.WebhooksController = void 0;
var common_1 = require("@nestjs/common");
var runs_service_1 = require("./runs/runs.service");
var agent_core_1 = require("@verifyos/agent-core");
/**
 * D3：GitLab webhook 入口（骨架）。
 * 真实链路：MR 打开/更新 → CI 回传 preview URL → 本端点带 preview URL 触发 Run。
 * stub 模式：preview URL 用本地 fixture（真实环境由 GITLAB_WEBHOOK_TOKEN + CI 变量接入）。
 */
var WebhooksController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/webhooks')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _gitlab_decorators;
    var WebhooksController = _classThis = /** @class */ (function () {
        function WebhooksController_1(runs, exploreSvc) {
            this.runs = (__runInitializers(this, _instanceExtraInitializers), runs);
            this.exploreSvc = exploreSvc;
        }
        /** D3：MR webhook → 影响分析（diff→LLM 业务域+定向回归建议）→ 定向 Run */
        WebhooksController_1.prototype.gitlab = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var kind, attrs, iid, branch, title, diffText, changedFiles, llm, impact, err_1, domain, login, targetSteps, issues, _i, _a, a, dup, startUrl, trigger, projName, userName;
                var _this = this;
                var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
                return __generator(this, function (_t) {
                    switch (_t.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _t.sent(); // webhook 可能是重启后第一个请求——先确保 pool/schema 就绪
                            kind = (_b = body === null || body === void 0 ? void 0 : body.object_kind) !== null && _b !== void 0 ? _b : 'unknown';
                            if (kind !== 'merge_request') {
                                return [2 /*return*/, { accepted: false, reason: "ignored object_kind=".concat(kind) }];
                            }
                            attrs = ((_c = body === null || body === void 0 ? void 0 : body.object_attributes) !== null && _c !== void 0 ? _c : {});
                            iid = attrs.iid;
                            branch = (_d = attrs.source_branch) !== null && _d !== void 0 ? _d : 'unknown-branch';
                            title = (_e = attrs.title) !== null && _e !== void 0 ? _e : "MR !".concat(iid !== null && iid !== void 0 ? iid : '?');
                            diffText = (_f = body.diff) !== null && _f !== void 0 ? _f : undefined;
                            changedFiles = (_g = body.changed_files) !== null && _g !== void 0 ? _g : undefined;
                            llm = {
                                apiKey: (_h = process.env.LLM_API_KEY) !== null && _h !== void 0 ? _h : '',
                                baseURL: (_j = process.env.LLM_BASE_URL) !== null && _j !== void 0 ? _j : 'https://open.bigmodel.cn/api/paas/v4',
                                model: (_k = process.env.LLM_MODEL) !== null && _k !== void 0 ? _k : 'glm-4.5v',
                            };
                            _t.label = 2;
                        case 2:
                            _t.trys.push([2, 4, , 5]);
                            return [4 /*yield*/, (0, agent_core_1.analyzeImpact)({ prTitle: title, diffText: diffText, changedFiles: changedFiles, llm: llm })];
                        case 3:
                            impact = _t.sent();
                            return [3 /*break*/, 5];
                        case 4:
                            err_1 = _t.sent();
                            console.log('[webhook] ⚠️ LLM 影响分析失败，降级启发式：', err_1 instanceof Error ? err_1.message.slice(0, 80) : err_1);
                            domain = (_o = (_m = (_l = changedFiles === null || changedFiles === void 0 ? void 0 : changedFiles[0]) === null || _l === void 0 ? void 0 : _l.split('/')[0]) !== null && _m !== void 0 ? _m : branch.split('/')[1]) !== null && _o !== void 0 ? _o : '核心业务';
                            impact = {
                                summary: "\uFF08LLM \u5206\u6790\u964D\u7EA7\uFF1A\u6A21\u578B\u8F93\u51FA\u4E0D\u5408 schema\uFF09\u57FA\u4E8E\u53D8\u66F4\u6587\u4EF6\u7684\u542F\u53D1\u5F0F\u5206\u6790\uFF1A\u672C\u6B21\u6539\u52A8\u6D89\u53CA ".concat(domain, " \u57DF\uFF08").concat((changedFiles !== null && changedFiles !== void 0 ? changedFiles : []).join(', ') || branch, "\uFF09\uFF0C\u5EFA\u8BAE\u5BF9\u65E2\u6709\u6D41\u7A0B\u505A\u5B9A\u5411\u56DE\u5F52\u3002"),
                                affectedAreas: [{ area: "".concat(domain, " \u6D41\u7A0B\u56DE\u5F52"), risk: 'medium', reason: "changed files: ".concat((changedFiles !== null && changedFiles !== void 0 ? changedFiles : []).join(', ') || '未知') }],
                                regressionSuggestions: [
                                    { title: "".concat(title, " \u53D8\u66F4\u540E\u4E3B\u6D41\u7A0B\u56DE\u5F52"), targetUrlHint: 'list.html' },
                                    { title: "".concat(domain, " \u5173\u952E\u65AD\u8A00\u590D\u9A8C"), targetUrlHint: 'list.html' },
                                ],
                            };
                            return [3 /*break*/, 5];
                        case 5:
                            login = runs_service_1.DEMO_STEPS[0];
                            targetSteps = __spreadArray([
                                login
                            ], impact.regressionSuggestions.slice(0, 3).map(function (sug, i) {
                                var _a;
                                return ({
                                    id: "st_reg_".concat(i + 1),
                                    title: sug.title,
                                    kind: 'assertion',
                                    assert: { kind: 'url_contains', value: 'list.html' },
                                    targetRef: (_a = sug.targetUrlHint) !== null && _a !== void 0 ? _a : undefined,
                                });
                            }), true);
                            issues = [];
                            _i = 0, _a = impact.affectedAreas.filter(function (x) { return x.risk !== 'low'; });
                            _t.label = 6;
                        case 6:
                            if (!(_i < _a.length)) return [3 /*break*/, 10];
                            a = _a[_i];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM issue WHERE title = $1 AND status = 'open' LIMIT 1", [a.area])];
                        case 7:
                            dup = _t.sent();
                            if (!(dup.rows.length === 0)) return [3 /*break*/, 9];
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO issue(short_id, application_id, title, severity, source)\n           VALUES ($1, 1, $2, $3, $4::jsonb)", ["iss_".concat(Math.random().toString(36).slice(2, 8)), a.area, a.risk, JSON.stringify({ reason: a.reason, pr: title, mrIid: iid })])];
                        case 8:
                            _t.sent();
                            issues.push({ title: a.area, severity: a.risk });
                            _t.label = 9;
                        case 9:
                            _i++;
                            return [3 /*break*/, 6];
                        case 10:
                            startUrl = this.runs.fixtureEntryUrl;
                            return [4 /*yield*/, this.runs.trigger({ startUrl: startUrl, steps: targetSteps })];
                        case 11:
                            trigger = _t.sent();
                            if (!(iid != null)) return [3 /*break*/, 13];
                            projName = String((_q = (_p = body === null || body === void 0 ? void 0 : body.project) === null || _p === void 0 ? void 0 : _p.name) !== null && _q !== void 0 ? _q : 'order-api');
                            userName = String((_s = (_r = body === null || body === void 0 ? void 0 : body.user) === null || _r === void 0 ? void 0 : _r.name) !== null && _s !== void 0 ? _s : 'gitlab-user');
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO mr(iid, title, state, author, repo, source_branch, review)\n         VALUES ($1,$2,'opened',$3,$4,$5,$6::jsonb)\n         ON CONFLICT (iid) DO UPDATE SET title = EXCLUDED.title, source_branch = EXCLUDED.source_branch,\n           review = EXCLUDED.review, running = false, updated_at = now()", [iid, title, userName, projName, branch, JSON.stringify({
                                        verdict: 'unknown',
                                        checkedAt: '刚刚 · webhook 自动触发（preview 就绪）',
                                        summary: impact.summary,
                                        areas: impact.affectedAreas.map(function (a) { return ({
                                            title: a.area, severity: a.risk === 'high' ? 'high' : 'info',
                                            related: a.risk === 'high' ? '本 PR 相关' : null, hint: a.reason, action: null,
                                        }); }),
                                        tests: impact.regressionSuggestions.slice(0, 5).map(function (s, i) { return ({
                                            title: s.title, status: 'unknown', source: "webhook \u5B9A\u5411\u56DE\u5F52 #".concat(i + 1), durationSec: 0,
                                        }); }),
                                        bot: "webhook \u89E6\u53D1\uFF1A".concat(impact.regressionSuggestions.length, " \u6761\u5B9A\u5411\u56DE\u5F52\u5EFA\u8BAE\u5DF2\u6CE8\u5165 Run \u6267\u884C\uFF08\u9632\u5047\u7EFF targetRef \u751F\u6548\uFF09\u3002"),
                                    })])];
                        case 12:
                            _t.sent();
                            // F11-dyn: 动态探索（探索式回归）——mini-explore 收集 Live Findings，完成后合并进 MR review
                            // 异步执行（webhook 响应不等待）；引擎忙则诚实标注跳过（explore 服务状态全局共享，并发会互相污染）
                            void (function () { return __awaiter(_this, void 0, void 0, function () {
                                var findings, done, cur, review, err_2;
                                var _a, _b, _c, _d, _e, _f, _g, _h;
                                return __generator(this, function (_j) {
                                    switch (_j.label) {
                                        case 0:
                                            if (!this.exploreSvc.controlState().running) return [3 /*break*/, 2];
                                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE mr SET review = jsonb_set(review, '{bot}', to_jsonb((review->>'bot') || ' \u52A8\u6001\u63A2\u7D22\u8DF3\u8FC7\uFF08\u63A2\u7D22\u5F15\u64CE\u5FD9\uFF0C\u7A0D\u540E\u91CD\u8BD5\uFF09\u3002')), updated_at = now() WHERE iid = $1", [iid]).catch(function () { return undefined; })];
                                        case 1:
                                            _j.sent();
                                            return [2 /*return*/];
                                        case 2:
                                            findings = [];
                                            _j.label = 3;
                                        case 3:
                                            _j.trys.push([3, 8, , 9]);
                                            return [4 /*yield*/, this.exploreSvc.explore({ startUrl: startUrl, intent: "PR !".concat(iid, " \u52A8\u6001\u63A2\u7D22\uFF08\u63A2\u7D22\u5F0F\u56DE\u5F52\uFF09"), maxActions: 5, credential: { username: 'admin', password: 'test123' } }, function (e) { if (e.finding)
                                                    findings.push(e.finding); })];
                                        case 4:
                                            done = _j.sent();
                                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT review FROM mr WHERE iid = $1 LIMIT 1", [iid])];
                                        case 5:
                                            cur = _j.sent();
                                            if (!(cur.rows.length > 0)) return [3 /*break*/, 7];
                                            review = ((_a = cur.rows[0].review) !== null && _a !== void 0 ? _a : {});
                                            review.dynamicFindings = findings.slice(0, 6);
                                            review.dynamicStats = { pages: (_b = done.pages) !== null && _b !== void 0 ? _b : 0, edges: (_c = done.edges) !== null && _c !== void 0 ? _c : 0, qaCount: (_d = done.qaCount) !== null && _d !== void 0 ? _d : 0 };
                                            review.bot = "".concat((_e = review.bot) !== null && _e !== void 0 ? _e : '', " \u52A8\u6001\u63A2\u7D22\u5B8C\u6210\uFF1A").concat((_f = done.pages) !== null && _f !== void 0 ? _f : 0, " \u9875 \u00B7 ").concat((_g = done.edges) !== null && _g !== void 0 ? _g : 0, " \u8FB9 \u00B7 \u65B0\u589E ").concat((_h = done.qaCount) !== null && _h !== void 0 ? _h : 0, " \u6761 QA \u5019\u9009 \u00B7 ").concat(findings.length, " \u6761\u65B0\u53D1\u73B0\u3002");
                                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE mr SET review = $2::jsonb, updated_at = now() WHERE iid = $1", [iid, JSON.stringify(review)])];
                                        case 6:
                                            _j.sent();
                                            _j.label = 7;
                                        case 7: return [3 /*break*/, 9];
                                        case 8:
                                            err_2 = _j.sent();
                                            console.log('[webhook] 动态探索失败（不阻塞主链路）：', err_2 instanceof Error ? err_2.message.slice(0, 80) : err_2);
                                            return [3 /*break*/, 9];
                                        case 9: return [2 /*return*/];
                                    }
                                });
                            }); })();
                            _t.label = 13;
                        case 13: return [2 /*return*/, __assign({ accepted: true, mr: { iid: iid, branch: branch, title: title }, issuesCreated: issues.length > 0 ? issues : undefined, impact: {
                                    summary: impact.summary,
                                    affectedAreas: impact.affectedAreas,
                                    regressionCount: impact.regressionSuggestions.length,
                                }, targetSteps: targetSteps.map(function (s) { return ({ id: s.id, title: s.title, targetRef: s.targetRef }); }), previewUrl: startUrl, dynamicExplore: iid != null ? 'started（mini-explore 约 30-60s，完成后 MR 详情出现「动态探索新发现」）' : undefined }, trigger)];
                    }
                });
            });
        };
        return WebhooksController_1;
    }());
    __setFunctionName(_classThis, "WebhooksController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _gitlab_decorators = [(0, common_1.Post)('gitlab')];
        __esDecorate(_classThis, null, _gitlab_decorators, { kind: "method", name: "gitlab", static: false, private: false, access: { has: function (obj) { return "gitlab" in obj; }, get: function (obj) { return obj.gitlab; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        WebhooksController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return WebhooksController = _classThis;
}();
exports.WebhooksController = WebhooksController;
