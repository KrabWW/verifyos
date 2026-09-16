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
exports.HttpStatus = exports.HttpException = exports.QaPointsController = void 0;
var common_1 = require("@nestjs/common");
var agent_core_1 = require("@verifyos/agent-core");
var QaPointsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _qaPoints_decorators;
    var _qaStatus_decorators;
    var _delQaPoint_decorators;
    var _qaFromFinding_decorators;
    var QaPointsController = _classThis = /** @class */ (function () {
        function QaPointsController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        QaPointsController_1.prototype.qaPoints = function (applicationId) {
            return __awaiter(this, void 0, void 0, function () {
                var raw, appId, store, rows;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            raw = (applicationId !== null && applicationId !== void 0 ? applicationId : '').trim();
                            appId = raw === '' ? 1 : Number(raw);
                            if (!Number.isFinite(appId))
                                throw new common_1.BadRequestException('invalid id');
                            store = new agent_core_1.QaPointStore(this.exploreSvc.pg);
                            return [4 /*yield*/, store.list(appId)];
                        case 2:
                            rows = _a.sent();
                            return [2 /*return*/, { items: rows, kind: this.exploreSvc.kind }];
                    }
                });
            });
        };
        QaPointsController_1.prototype.qaStatus = function (shortId, body) {
            return __awaiter(this, void 0, void 0, function () {
                var next, cur, from, canMove;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _b.sent();
                            next = body === null || body === void 0 ? void 0 : body.status;
                            if (typeof next !== 'string' || next === '')
                                throw new common_1.BadRequestException('status required');
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT status FROM qa_point WHERE short_id = $1 LIMIT 1", [shortId])];
                        case 2:
                            cur = _b.sent();
                            if (cur.rows.length === 0)
                                throw new common_1.NotFoundException('not found');
                            from = cur.rows[0].status;
                            canMove = from === next || ((_a = QaPointsController.QA_TRANSITIONS[from]) !== null && _a !== void 0 ? _a : []).includes(next);
                            if (!canMove)
                                throw new common_1.BadRequestException("invalid transition: ".concat(from, "\u2192").concat(next));
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE qa_point SET status = $2, updated_at = now() WHERE short_id = $1", [shortId, next])];
                        case 3:
                            _b.sent();
                            return [2 /*return*/, { ok: true, status: next }];
                    }
                });
            });
        };
        /** 删除 QA 点（详情抽屉操作）：:id 兼容数字主键与 short_id（前端列表只有 short_id）；不存在 → 404 */
        QaPointsController_1.prototype.delQaPoint = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("DELETE FROM qa_point WHERE id::text = $1 OR short_id = $1 RETURNING id", [id])];
                        case 2:
                            r = _a.sent();
                            if (r.rowCount === 0)
                                throw new common_1.NotFoundException('not found');
                            return [2 /*return*/, { ok: true }];
                    }
                });
            });
        };
        /** Live Finding → QA 点（status=discovered，状态机起点；后续在 QA 点页确认） */
        QaPointsController_1.prototype.qaFromFinding = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var dup, shortId, r;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _d.sent();
                            if (!(body === null || body === void 0 ? void 0 : body.title) || !body.title.trim())
                                throw new common_1.BadRequestException('title required');
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, short_id FROM qa_point WHERE title = $1 LIMIT 1", [body.title])];
                        case 2:
                            dup = _d.sent();
                            if (dup.rows.length > 0)
                                return [2 /*return*/, { deduped: true, shortId: dup.rows[0].short_id }];
                            shortId = "qa_".concat(Math.random().toString(36).slice(2, 8));
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO qa_point(short_id, application_id, title, category, risk, status, confidence, source)\n       VALUES ($1, 1, $2, '\u63A2\u7D22\u53D1\u73B0', $3, 'discovered', 0.6, $4::jsonb) RETURNING id", [shortId, body.title, (_a = body.risk) !== null && _a !== void 0 ? _a : 'medium', JSON.stringify({ from: 'live-finding', detail: (_b = body.detail) !== null && _b !== void 0 ? _b : '', explorationId: (_c = body.explorationId) !== null && _c !== void 0 ? _c : null })])];
                        case 3:
                            r = _d.sent();
                            return [2 /*return*/, { ok: true, id: r.rows[0].id, shortId: shortId }];
                    }
                });
            });
        };
        return QaPointsController_1;
    }());
    __setFunctionName(_classThis, "QaPointsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _qaPoints_decorators = [(0, common_1.Get)('qa-points')];
        _qaStatus_decorators = [(0, common_1.Put)('qa-points/:shortId/status')];
        _delQaPoint_decorators = [(0, common_1.Delete)('qa-points/:id')];
        _qaFromFinding_decorators = [(0, common_1.Post)('qa-points/from-finding')];
        __esDecorate(_classThis, null, _qaPoints_decorators, { kind: "method", name: "qaPoints", static: false, private: false, access: { has: function (obj) { return "qaPoints" in obj; }, get: function (obj) { return obj.qaPoints; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _qaStatus_decorators, { kind: "method", name: "qaStatus", static: false, private: false, access: { has: function (obj) { return "qaStatus" in obj; }, get: function (obj) { return obj.qaStatus; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _delQaPoint_decorators, { kind: "method", name: "delQaPoint", static: false, private: false, access: { has: function (obj) { return "delQaPoint" in obj; }, get: function (obj) { return obj.delQaPoint; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _qaFromFinding_decorators, { kind: "method", name: "qaFromFinding", static: false, private: false, access: { has: function (obj) { return "qaFromFinding" in obj; }, get: function (obj) { return obj.qaFromFinding; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaPointsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    })();
    /**
     * QA 点状态流转（B1 状态机守卫，J01 任务5）：
     * 合法矩阵 discovered→selected→generated，允许 selected→discovered 撤回、generated→selected 回退；
     * 禁止跳到 passed 等终态（终态由 Run 引擎写入，不走本端点）。
     * 非法值/非法流转 → 400 invalid transition；不存在 shortId → 404；无静默 fallback。
     */
    _classThis.QA_TRANSITIONS = {
        discovered: ['selected'],
        selected: ['discovered', 'generated'],
        generated: ['selected'],
    };
    (function () {
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaPointsController = _classThis;
}();
exports.QaPointsController = QaPointsController;
