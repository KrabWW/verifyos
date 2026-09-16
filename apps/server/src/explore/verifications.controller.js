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
exports.VerificationsController = void 0;
var common_1 = require("@nestjs/common");
var VerificationsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _genVerification_decorators;
    var _listVerifications_decorators;
    var _getVerification_decorators;
    var _createBlank_decorators;
    var _putSteps_decorators;
    var VerificationsController = _classThis = /** @class */ (function () {
        function VerificationsController_1(exploreSvc, runs) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.runs = runs;
        }
        /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
        VerificationsController_1.prototype.numericId = function (raw) {
            var n = Number(raw);
            if (!Number.isFinite(n))
                throw new common_1.BadRequestException('invalid id');
            return n;
        };
        /** QA 点 → 验证生成（探索→执行最后一公里）：从 QA 点构造步骤（登录前置 + 断言 + targetRef），可一键触发 */
        VerificationsController_1.prototype.genVerification = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var qa, row, sourceUrl, pathHint, steps, shortId, actor, r, verificationId, runId, trigger;
                var _a, _b, _c, _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _e.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, title, category, risk, source FROM qa_point WHERE short_id = $1 LIMIT 1", [body.qaShortId])];
                        case 2:
                            qa = _e.sent();
                            if (qa.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            row = qa.rows[0];
                            sourceUrl = String((_b = (_a = row.source) === null || _a === void 0 ? void 0 : _a.sourceUrl) !== null && _b !== void 0 ? _b : '');
                            pathHint = sourceUrl.replace(/^https?:\/\/[^/]+/, '') || 'list.html';
                            steps = [
                                {
                                    id: 'st_01', title: '管理员登录', kind: 'module',
                                    actions: [
                                        { type: 'fill', selector: '#username', value: 'admin' },
                                        { type: 'fill', selector: '#password', value: 'test123' },
                                        { type: 'click', selector: 'button[type="submit"]' },
                                    ],
                                },
                                {
                                    id: 'st_02', title: row.title, kind: 'assertion',
                                    assert: { kind: 'url_contains', value: pathHint.replace(/^\//, '') },
                                    targetRef: pathHint.replace(/^\//, ''),
                                },
                            ];
                            shortId = "ver_".concat(Math.random().toString(36).slice(2, 8));
                            actor = String((_d = (_c = row.source) === null || _c === void 0 ? void 0 : _c.actor) !== null && _d !== void 0 ? _d : '管理员');
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)\n       VALUES ($1, $2, $3, $4, $5::jsonb, 'ready') RETURNING id", [shortId, row.id, row.title, actor, JSON.stringify(steps)])];
                        case 3:
                            r = _e.sent();
                            verificationId = r.rows[0].id;
                            // F5: QA 状态机流转（生成验证后 → generated）
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE qa_point SET status = 'generated', updated_at = now() WHERE id = $1", [row.id])];
                        case 4:
                            // F5: QA 状态机流转（生成验证后 → generated）
                            _e.sent();
                            if (!(body === null || body === void 0 ? void 0 : body.trigger)) return [3 /*break*/, 6];
                            return [4 /*yield*/, this.runs.trigger({ steps: steps })];
                        case 5:
                            trigger = _e.sent();
                            runId = trigger.runId;
                            _e.label = 6;
                        case 6: return [2 /*return*/, { found: true, verificationId: verificationId, shortId: shortId, steps: steps, runId: runId }];
                    }
                });
            });
        };
        // ---------- F6：验证编辑器（列表 / 详情 / 步骤保存 / 空白新建） ----------
        /** 空白验证挂靠的「手工」QA 锚点（qa_point_id NOT NULL 约束下的诚实方案） */
        VerificationsController_1.prototype.manualQaAnchorId = function () {
            return __awaiter(this, void 0, void 0, function () {
                var q, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM qa_point WHERE short_id = 'qa_manual' LIMIT 1")];
                        case 1:
                            q = _a.sent();
                            if (q.rows.length > 0)
                                return [2 /*return*/, q.rows[0].id];
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO qa_point(short_id, application_id, title, category, status, confidence, source)\n       VALUES ('qa_manual', 1, '\u624B\u5DE5\u521B\u5EFA\uFF08\u9A8C\u8BC1\u7F16\u8F91\u5668\u5165\u53E3\uFF09', '\u6B63\u5E38\u6D41\u7A0B', 'selected', 1.0, '{\"manual\":true}'::jsonb)\n       RETURNING id")];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, r.rows[0].id];
                    }
                });
            });
        };
        VerificationsController_1.prototype.listVerifications = function () {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,\n              q.short_id AS qa_short_id, q.title AS qa_title\n       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id\n       ORDER BY v.updated_at DESC LIMIT 50")];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, { items: r.rows }];
                    }
                });
            });
        };
        VerificationsController_1.prototype.getVerification = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT v.id, v.short_id, v.title, v.actor, v.status, v.steps,\n              q.short_id AS qa_short_id, q.title AS qa_title\n       FROM verification v LEFT JOIN qa_point q ON q.id = v.qa_point_id\n       WHERE v.id = $1 LIMIT 1", [Number(id)])];
                        case 2:
                            r = _a.sent();
                            if (r.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            return [2 /*return*/, __assign({ found: true }, r.rows[0])];
                    }
                });
            });
        };
        /** 空白验证：预填登录模块 + 断言步骤（编辑器里改成目标行为） */
        VerificationsController_1.prototype.createBlank = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var qaId, shortId, steps, r;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, this.manualQaAnchorId()];
                        case 2:
                            qaId = _c.sent();
                            shortId = "ver_".concat(Math.random().toString(36).slice(2, 8));
                            steps = [
                                {
                                    id: 'st_01', title: '管理员登录', kind: 'module',
                                    actions: [
                                        { type: 'fill', selector: '#username', value: 'admin' },
                                        { type: 'fill', selector: '#password', value: 'test123' },
                                        { type: 'click', selector: 'button[type="submit"]' },
                                    ],
                                },
                                {
                                    id: 'st_02', title: '新断言步骤', kind: 'assertion',
                                    assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html',
                                },
                            ];
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO verification(short_id, qa_point_id, title, actor, steps, status)\n       VALUES ($1, $2, $3, $4, $5::jsonb, 'draft') RETURNING id, short_id", [shortId, qaId, ((_a = body === null || body === void 0 ? void 0 : body.title) === null || _a === void 0 ? void 0 : _a.trim()) || '手工验证', ((_b = body === null || body === void 0 ? void 0 : body.actor) === null || _b === void 0 ? void 0 : _b.trim()) || '管理员', JSON.stringify(steps)])];
                        case 3:
                            r = _c.sent();
                            return [2 /*return*/, { found: true, id: r.rows[0].id, shortId: r.rows[0].short_id, steps: steps }];
                    }
                });
            });
        };
        /** 保存步骤（含标题/角色）：status 流转 draft→ready；不存在 → 404（0 行更新不再假成功） */
        VerificationsController_1.prototype.putSteps = function (id, body) {
            return __awaiter(this, void 0, void 0, function () {
                var verId, sets, vals, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            verId = this.numericId(id);
                            sets = ["updated_at = now()"];
                            vals = [verId];
                            if ((body === null || body === void 0 ? void 0 : body.title) != null) {
                                sets.push("title = $".concat(vals.length + 1));
                                vals.push(String(body.title));
                            }
                            if ((body === null || body === void 0 ? void 0 : body.actor) != null) {
                                sets.push("actor = $".concat(vals.length + 1));
                                vals.push(String(body.actor));
                            }
                            if (Array.isArray(body === null || body === void 0 ? void 0 : body.steps)) {
                                sets.push("steps = $".concat(vals.length + 1, "::jsonb"));
                                vals.push(JSON.stringify(body.steps));
                                sets.push("status = 'ready'");
                            }
                            if (sets.length === 1)
                                return [2 /*return*/, { ok: false, reason: 'no fields to update' }];
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE verification SET ".concat(sets.join(', '), " WHERE id = $1"), vals)];
                        case 2:
                            r = _a.sent();
                            if (r.rowCount === 0)
                                throw new common_1.NotFoundException('not found');
                            return [2 /*return*/, { ok: true }];
                    }
                });
            });
        };
        return VerificationsController_1;
    }());
    __setFunctionName(_classThis, "VerificationsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _genVerification_decorators = [(0, common_1.Post)('verifications')];
        _listVerifications_decorators = [(0, common_1.Get)('verifications')];
        _getVerification_decorators = [(0, common_1.Get)('verifications/:id')];
        _createBlank_decorators = [(0, common_1.Post)('verifications/blank')];
        _putSteps_decorators = [(0, common_1.Put)('verifications/:id/steps')];
        __esDecorate(_classThis, null, _genVerification_decorators, { kind: "method", name: "genVerification", static: false, private: false, access: { has: function (obj) { return "genVerification" in obj; }, get: function (obj) { return obj.genVerification; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _listVerifications_decorators, { kind: "method", name: "listVerifications", static: false, private: false, access: { has: function (obj) { return "listVerifications" in obj; }, get: function (obj) { return obj.listVerifications; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getVerification_decorators, { kind: "method", name: "getVerification", static: false, private: false, access: { has: function (obj) { return "getVerification" in obj; }, get: function (obj) { return obj.getVerification; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _createBlank_decorators, { kind: "method", name: "createBlank", static: false, private: false, access: { has: function (obj) { return "createBlank" in obj; }, get: function (obj) { return obj.createBlank; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _putSteps_decorators, { kind: "method", name: "putSteps", static: false, private: false, access: { has: function (obj) { return "putSteps" in obj; }, get: function (obj) { return obj.putSteps; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        VerificationsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return VerificationsController = _classThis;
}();
exports.VerificationsController = VerificationsController;
