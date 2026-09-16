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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssuesController = void 0;
var common_1 = require("@nestjs/common");
/** 问题库：MR 影响分析高风险自动转入 + 手动创建 + 状态流转（open→resolved） */
var IssuesController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/issues')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _list_decorators;
    var _add_decorators;
    var _trace_decorators;
    var _sync_decorators;
    var _upd_decorators;
    var IssuesController = _classThis = /** @class */ (function () {
        function IssuesController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        IssuesController_1.prototype.list = function (status) {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, short_id, title, severity, status, source, created_at, resolved_at\n       FROM issue WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC", [status !== null && status !== void 0 ? status : null])];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, { items: r.rows }];
                    }
                });
            });
        };
        /** 通用落库（webhook impact 高风险也会调用同逻辑，见 webhooks.controller） */
        IssuesController_1.prototype.add = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var dup, shortId, r;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _c.sent();
                            // 必填缺失 → 400（而非 PG NOT NULL 裸 500）
                            if (!(body === null || body === void 0 ? void 0 : body.title) || !body.title.trim())
                                throw new BadRequestException('title required');
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM issue WHERE title = $1 AND status = 'open' LIMIT 1", [body.title])];
                        case 2:
                            dup = _c.sent();
                            if (dup.rows.length > 0)
                                return [2 /*return*/, { id: dup.rows[0].id, deduped: true }];
                            shortId = "iss_".concat(Math.random().toString(36).slice(2, 8));
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO issue(short_id, application_id, title, severity, source)\n       VALUES ($1, 1, $2, $3, $4::jsonb) RETURNING id", [shortId, body.title, (_a = body.severity) !== null && _a !== void 0 ? _a : 'medium', JSON.stringify((_b = body.source) !== null && _b !== void 0 ? _b : {})])];
                        case 3:
                            r = _c.sent();
                            return [2 /*return*/, { id: r.rows[0].id }];
                    }
                });
            });
        };
        /** G11：全链路追溯——issue.source.runId 反查 run → verification → qa_point（查得到就填，查不到 null） */
        IssuesController_1.prototype.trace = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var issueId, q, source, runId, empty, r, row, _a;
                var _b, _c, _d, _e;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _f.sent();
                            issueId = this.numericId(id);
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT source FROM issue WHERE id = $1 LIMIT 1", [issueId])];
                        case 2:
                            q = _f.sent();
                            if (q.rows.length === 0)
                                return [2 /*return*/, { found: false, run: null, verification: null, qa: null }];
                            source = ((_b = q.rows[0].source) !== null && _b !== void 0 ? _b : {});
                            runId = typeof source.runId === 'string' && source.runId ? source.runId : null;
                            empty = { run: null, verification: null, qa: null };
                            if (!runId)
                                return [2 /*return*/, __assign({ found: true }, empty)];
                            _f.label = 3;
                        case 3:
                            _f.trys.push([3, 5, , 6]);
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT r.short_id AS run_short_id, r.verdict,\n                v.short_id AS ver_short_id, v.title AS ver_title,\n                qa.short_id AS qa_short_id, qa.title AS qa_title\n         FROM run r\n         LEFT JOIN verification v ON v.id = r.verification_id\n         LEFT JOIN qa_point qa ON qa.id = v.qa_point_id\n         WHERE r.short_id = $1 LIMIT 1", [runId])];
                        case 4:
                            r = _f.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, __assign({ found: true }, empty)];
                            row = r.rows[0];
                            return [2 /*return*/, {
                                    found: true,
                                    run: { id: row.run_short_id, verdict: (_c = row.verdict) !== null && _c !== void 0 ? _c : null },
                                    verification: row.ver_short_id ? { shortId: row.ver_short_id, title: (_d = row.ver_title) !== null && _d !== void 0 ? _d : '' } : null,
                                    qa: row.qa_short_id ? { shortId: row.qa_short_id, title: (_e = row.qa_title) !== null && _e !== void 0 ? _e : '' } : null,
                                }];
                        case 5:
                            _a = _f.sent();
                            return [2 /*return*/, __assign({ found: true }, empty)];
                        case 6: return [2 /*return*/];
                    }
                });
            });
        };
        /** F13: 同步外部（禅道/Jira 占位——MCP 连接器语义，真连接器属 F15 MCP 后续）：source 合并 external ref */
        IssuesController_1.prototype.sync = function (id, body) {
            return __awaiter(this, void 0, void 0, function () {
                var sys, q, extId, merged;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            sys = (body === null || body === void 0 ? void 0 : body.system) === 'jira' ? 'jira' : 'zentao';
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT source FROM issue WHERE id = $1 LIMIT 1", [Number(id)])];
                        case 2:
                            q = _a.sent();
                            if (q.rows.length === 0)
                                return [2 /*return*/, { ok: false, reason: 'issue 不存在' }];
                            extId = "".concat(sys === 'jira' ? 'JRA' : 'ZT', "-").concat(Math.floor(1000 + Math.random() * 9000));
                            merged = __assign(__assign({}, q.rows[0].source), { external: { system: sys, id: extId, syncedAt: new Date().toISOString() } });
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE issue SET source = $2::jsonb WHERE id = $1", [Number(id), JSON.stringify(merged)])];
                        case 3:
                            _a.sent();
                            return [2 /*return*/, { ok: true, system: sys, externalId: extId, note: 'stub 推送：禅道/Jira MCP 连接器接入后真实下发' }];
                    }
                });
            });
        };
        IssuesController_1.prototype.upd = function (id, body) {
            return __awaiter(this, void 0, void 0, function () {
                var resolved;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _b.sent();
                            resolved = (body === null || body === void 0 ? void 0 : body.status) === 'resolved';
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE issue SET status = $2, resolved_at = $3 WHERE id = $1", [Number(id), (_a = body === null || body === void 0 ? void 0 : body.status) !== null && _a !== void 0 ? _a : 'resolved', resolved ? new Date().toISOString() : null])];
                        case 2:
                            _b.sent();
                            return [2 /*return*/, { ok: true }];
                    }
                });
            });
        };
        return IssuesController_1;
    }());
    __setFunctionName(_classThis, "IssuesController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _list_decorators = [(0, common_1.Get)()];
        _add_decorators = [(0, common_1.Post)()];
        _trace_decorators = [(0, common_1.Get)(':id/trace')];
        _sync_decorators = [(0, common_1.Post)(':id/sync')];
        _upd_decorators = [(0, common_1.Put)(':id')];
        __esDecorate(_classThis, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: function (obj) { return "list" in obj; }, get: function (obj) { return obj.list; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _add_decorators, { kind: "method", name: "add", static: false, private: false, access: { has: function (obj) { return "add" in obj; }, get: function (obj) { return obj.add; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _trace_decorators, { kind: "method", name: "trace", static: false, private: false, access: { has: function (obj) { return "trace" in obj; }, get: function (obj) { return obj.trace; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _sync_decorators, { kind: "method", name: "sync", static: false, private: false, access: { has: function (obj) { return "sync" in obj; }, get: function (obj) { return obj.sync; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _upd_decorators, { kind: "method", name: "upd", static: false, private: false, access: { has: function (obj) { return "upd" in obj; }, get: function (obj) { return obj.upd; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        IssuesController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return IssuesController = _classThis;
}();
exports.IssuesController = IssuesController;
