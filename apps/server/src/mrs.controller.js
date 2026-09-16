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
exports.MrsController = void 0;
var common_1 = require("@nestjs/common");
var fs = require("fs");
var path = require("path");
var MrsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/mrs')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _list_decorators;
    var _detail_decorators;
    var _writeback_decorators;
    var MrsController = _classThis = /** @class */ (function () {
        function MrsController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        Object.defineProperty(MrsController_1.prototype, "pg", {
            get: function () { return this.exploreSvc.pg; },
            enumerable: false,
            configurable: true
        });
        /** 数字 iid 参数统一防护（J01 任务2）：NaN → 400 */
        MrsController_1.prototype.numericIid = function (raw) {
            var n = Number(raw);
            if (!Number.isFinite(n))
                throw new BadRequestException('invalid id');
            return n;
        };
        /** 表空自动种入原型数据（幂等：仅 COUNT=0 时） */
        MrsController_1.prototype.ensureSeed = function () {
            return __awaiter(this, void 0, void 0, function () {
                var c, _i, _a, m;
                var _b, _c, _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0: return [4 /*yield*/, this.pg.query("SELECT COUNT(*)::int AS n FROM mr")];
                        case 1:
                            c = _e.sent();
                            if (c.rows[0].n > 0)
                                return [2 /*return*/];
                            _i = 0, _a = MrsController.SEED;
                            _e.label = 2;
                        case 2:
                            if (!(_i < _a.length)) return [3 /*break*/, 5];
                            m = _a[_i];
                            return [4 /*yield*/, this.pg.query("INSERT INTO mr(iid, title, state, author, repo, source_branch, target_branch, additions, deletions, running, review)\n         VALUES ($1,$2,$3,$4,$5,$6,'main',$7,$8,$9,$10::jsonb)\n         ON CONFLICT (iid) DO NOTHING", [m.iid, m.title, m.state, m.author, m.repo, m.source_branch, (_b = m.additions) !== null && _b !== void 0 ? _b : 0, (_c = m.deletions) !== null && _c !== void 0 ? _c : 0, (_d = m.running) !== null && _d !== void 0 ? _d : false, m.review ? JSON.stringify(m.review) : null])];
                        case 3:
                            _e.sent();
                            _e.label = 4;
                        case 4:
                            _i++;
                            return [3 /*break*/, 2];
                        case 5:
                            console.log('[mrs] seed 原型 MR 数据已种入（6 条）');
                            return [2 /*return*/];
                    }
                });
            });
        };
        MrsController_1.prototype.list = function (state) {
            return __awaiter(this, void 0, void 0, function () {
                var where, vals, rows, stats, statMap, _i, _a, r;
                var _b, _c, _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _e.sent();
                            return [4 /*yield*/, this.ensureSeed()];
                        case 2:
                            _e.sent();
                            where = state && state !== 'all' ? "WHERE state = $1" : '';
                            vals = state && state !== 'all' ? [state] : [];
                            return [4 /*yield*/, this.pg.query("SELECT iid, title, state, author, repo, source_branch, target_branch, additions, deletions, running, review, created_at\n       FROM mr ".concat(where, " ORDER BY iid DESC"), vals)];
                        case 3:
                            rows = _e.sent();
                            return [4 /*yield*/, this.pg.query("SELECT state, COUNT(*)::int AS n FROM mr GROUP BY state")];
                        case 4:
                            stats = _e.sent();
                            statMap = {};
                            for (_i = 0, _a = stats.rows; _i < _a.length; _i++) {
                                r = _a[_i];
                                statMap[r.state] = r.n;
                            }
                            return [2 /*return*/, {
                                    stats: {
                                        all: Object.values(statMap).reduce(function (a, b) { return a + b; }, 0),
                                        opened: (_b = statMap.opened) !== null && _b !== void 0 ? _b : 0,
                                        merged: (_c = statMap.merged) !== null && _c !== void 0 ? _c : 0,
                                        closed: (_d = statMap.closed) !== null && _d !== void 0 ? _d : 0,
                                    },
                                    items: rows.rows,
                                }];
                    }
                });
            });
        };
        MrsController_1.prototype.detail = function (iid) {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.pg.query("SELECT * FROM mr WHERE iid = $1 LIMIT 1", [Number(iid)])];
                        case 2:
                            r = _a.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            return [2 /*return*/, __assign({ found: true }, r.rows[0])];
                    }
                });
            });
        };
        /** 回写 MR 状态（GitLab token 就绪前 stub）：评论落盘 out/mr-comments/ + updated_at 翻转 + 审计留痕 */
        MrsController_1.prototype.writeback = function (iid) {
            return __awaiter(this, void 0, void 0, function () {
                var r, mr, verdictLabel, body, dir, file;
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                return __generator(this, function (_l) {
                    switch (_l.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _l.sent();
                            return [4 /*yield*/, this.pg.query("SELECT iid, title, review FROM mr WHERE iid = $1 LIMIT 1", [Number(iid)])];
                        case 2:
                            r = _l.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, { ok: false, reason: 'MR not found' }];
                            mr = r.rows[0];
                            verdictLabel = ((_a = mr.review) === null || _a === void 0 ? void 0 : _a.verdict) === 'pass' ? '✓ 通过' : ((_b = mr.review) === null || _b === void 0 ? void 0 : _b.verdict) === 'fail' ? '✗ 阻止合并' : '⚠ 警告（不阻止合并）';
                            body = __spreadArray(__spreadArray([
                                "## VerifyOS Review \u00B7 MR !".concat(mr.iid),
                                "",
                                "**\u7ED3\u679C\uFF1A".concat(verdictLabel, "**"),
                                "",
                                (_d = (_c = mr.review) === null || _c === void 0 ? void 0 : _c.bot) !== null && _d !== void 0 ? _d : '（无 Review 数据）',
                                "",
                                "<details><summary>TESTS RUN (".concat((_f = (_e = mr.review) === null || _e === void 0 ? void 0 : _e.tests.length) !== null && _f !== void 0 ? _f : 0, ")</summary>")
                            ], ((_h = (_g = mr.review) === null || _g === void 0 ? void 0 : _g.tests) !== null && _h !== void 0 ? _h : []).map(function (t) { return "- ".concat(t.status === 'pass' ? '✓' : t.status === 'unknown' ? '?' : '✗', " ").concat(t.title, "\uFF08").concat(t.source, " \u00B7 ").concat(t.durationSec, "s\uFF09"); }), true), [
                                "</details>",
                                "",
                                "-- VerifyOS Bot\uFF08stub \u56DE\u5199\uFF1AGitLab token \u63A5\u5165\u540E\u81EA\u52A8\u53D1\u5E03\u5230 MR Conversation\uFF09",
                            ], false).join('\n');
                            dir = path.resolve(process.cwd(), '../../out/mr-comments');
                            fs.mkdirSync(dir, { recursive: true });
                            file = path.join(dir, "mr-".concat(mr.iid, "-comment.md"));
                            fs.writeFileSync(file, body, 'utf8');
                            return [4 /*yield*/, this.pg.query("UPDATE mr SET updated_at = now() WHERE iid = $1", [mr.iid])];
                        case 3:
                            _l.sent();
                            return [4 /*yield*/, this.pg.query("INSERT INTO audit_log(actor, action, target, meta) VALUES ('verifyos-bot','mr.writeback',$1,$2::jsonb)", ["MR !".concat(mr.iid), JSON.stringify({ file: file, verdict: (_k = (_j = mr.review) === null || _j === void 0 ? void 0 : _j.verdict) !== null && _k !== void 0 ? _k : null })])];
                        case 4:
                            _l.sent();
                            return [2 /*return*/, { ok: true, file: file, verdictLabel: verdictLabel, note: 'stub 回写：GitLab token 接入后经 API 发布到 MR Conversation' }];
                    }
                });
            });
        };
        return MrsController_1;
    }());
    __setFunctionName(_classThis, "MrsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _list_decorators = [(0, common_1.Get)()];
        _detail_decorators = [(0, common_1.Get)(':iid')];
        _writeback_decorators = [(0, common_1.Post)(':iid/writeback')];
        __esDecorate(_classThis, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: function (obj) { return "list" in obj; }, get: function (obj) { return obj.list; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _detail_decorators, { kind: "method", name: "detail", static: false, private: false, access: { has: function (obj) { return "detail" in obj; }, get: function (obj) { return obj.detail; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _writeback_decorators, { kind: "method", name: "writeback", static: false, private: false, access: { has: function (obj) { return "writeback" in obj; }, get: function (obj) { return obj.writeback; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MrsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    })();
    /** 原型种子（review 文案 = 原型 s-pr 详情态原文；表空自动种入） */
    _classThis.SEED = [
        {
            iid: 128, title: 'fix: 退款回调金额计算', state: 'opened', author: '张伟', repo: 'order-api',
            source_branch: 'fix/refund-callback', additions: 42, deletions: 8,
            review: {
                verdict: 'unknown',
                checkedAt: '5 分钟前 · Auto-triggered when deployment was ready',
                summary: '对本 PR 的改动（refund/callback.ts +42 −8）动态生成并执行了 9 项验证，8 项通过：金额计算分支的边界值（0、负数、超过实付）全部覆盖并通过；回调持久化与订单状态流转回归正常。「重复退款幂等拦截」步骤全绿但未触达本次修改的回调分支 —— 按 UNKNOWN 处理，不允许假绿。动态探索额外发现 2 个与本 PR 相关的问题，详见下方改进区。',
                areas: [
                    { title: 'HTTP request failed', severity: 'info', related: null, hint: 'Vercel preview 反馈脚本加载失败。Third-party, unrelated to this PR.', action: null },
                    { title: '金额为 0 时仍可提交退款', severity: 'high', related: '本 PR 相关', hint: '动态探索发现：金额下限未校验。建议补充 QA 点「退款金额必须 > 0」并禁用空金额提交。', action: 'gen-qa' },
                    { title: '连点退款按钮出现两条回调日志', severity: 'high', related: '本 PR 直接相关', hint: '39ms 内两条 POST /refund/callback 持久化成功 —— 正是本次修改的持久化路径。建议后端加唯一约束，已关联 QA-1022。', action: 'link-qa', qaId: 'QA-1022' },
                ],
                tests: [
                    { title: '退款金额等于实付可提交', status: 'pass', source: 'QA-1024 · 定向回归', durationSec: 38 },
                    { title: '退款金额为 0 被拒绝', status: 'pass', source: 'QA-1031 · 变更生成', durationSec: 24, tag: '新增边界' },
                    { title: '退款金额超过实付被拒绝', status: 'pass', source: 'QA-1024 · 定向回归', durationSec: 31 },
                    { title: '回调成功写入退款记录', status: 'pass', source: 'QA-0996 · 定向回归', durationSec: 45 },
                    { title: '重复退款幂等拦截', status: 'unknown', source: 'QA-1022 · 未触达修改分支 → UNKNOWN', durationSec: 38 },
                    { title: '退款后订单状态流转', status: 'pass', source: 'QA-1019 · 定向回归', durationSec: 26 },
                    { title: '登录（前置模块）', status: 'pass', source: 'Browser State 复用', durationSec: 12 },
                    { title: '动态探索：连点退款按钮', status: 'pass', source: '探索 #1026', durationSec: 52, tag: '新发现' },
                    { title: '动态探索：金额边界 fuzz', status: 'pass', source: '探索 #1026', durationSec: 47, tag: '新发现' },
                ],
                bot: '✓ 8 项通过 · ⚠ 1 项无法验证（未触达回调分支，按 UNKNOWN 处理）· 💡 2 个新发现（已附证据）。',
            },
        },
        { iid: 131, title: 'feat: 会员积分抵扣', state: 'opened', author: '李娜', repo: 'order-api', source_branch: 'feat/points-deduct', running: true },
        {
            iid: 127, title: 'refactor: 订单状态机重构', state: 'merged', author: '王强', repo: 'order-api',
            source_branch: 'refactor/order-state-machine', additions: 210, deletions: 96,
            review: {
                verdict: 'pass', checkedAt: '昨天', summary: '动态生成 14 项验证全部通过，状态机全路径回归无异常。',
                areas: [], bot: '✓ 14 项通过，可安全合并。',
                tests: [
                    { title: '订单创建 → 待支付', status: 'pass', source: 'QA-0881 · 定向回归', durationSec: 21 },
                    { title: '支付超时自动取消', status: 'pass', source: 'QA-0882 · 定向回归', durationSec: 33 },
                    { title: '状态回退拒绝', status: 'pass', source: 'QA-0883 · 定向回归', durationSec: 19 },
                ],
            },
        },
        {
            iid: 119, title: 'feat: 深色模式开关', state: 'merged', author: '李娜', repo: 'order-web',
            source_branch: 'feat/dark-mode', additions: 64, deletions: 12,
            review: {
                verdict: 'pass', checkedAt: '3 天前', summary: '7 项验证通过；动态探索发现 2 个与主题切换无关的改进点。',
                areas: [
                    { title: '对比度不足的次要文本', severity: 'high', related: null, hint: '深色模式下 placeholder 对比度 3.1:1（建议 4.5:1）。与本次改动无关，已记录。', action: 'gen-qa' },
                ],
                bot: '✓ 7 项通过 · 💡 2 个新发现（与本 PR 无关）。',
                tests: [
                    { title: '深色模式切换持久化', status: 'pass', source: 'QA-0910 · 变更生成', durationSec: 18 },
                    { title: '列表页深色渲染', status: 'pass', source: 'QA-0911 · 变更生成', durationSec: 22 },
                ],
            },
        },
        {
            iid: 112, title: 'fix: 员工编号唯一索引', state: 'merged', author: '张伟', repo: 'order-api',
            source_branch: 'fix/emp-unique-index', additions: 15, deletions: 3,
            review: {
                verdict: 'pass', checkedAt: '上周', summary: '5 项验证通过：重复编号创建被拒绝，存量数据迁移无冲突。',
                areas: [], bot: '✓ 5 项通过。',
                tests: [{ title: '重复编号创建被拒绝', status: 'pass', source: 'QA-0777 · 定向回归', durationSec: 17 }],
            },
        },
        { iid: 108, title: 'chore: 依赖升级', state: 'closed', author: '王强', repo: 'order-web', source_branch: 'chore/deps-upgrade' },
    ];
    (function () {
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MrsController = _classThis;
}();
exports.MrsController = MrsController;
