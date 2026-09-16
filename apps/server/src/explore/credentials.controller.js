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
exports.CredentialsController = void 0;
var common_1 = require("@nestjs/common");
var CredentialsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _listCredentials_decorators;
    var _addCredential_decorators;
    var _updCredential_decorators;
    var _delCredential_decorators;
    var CredentialsController = _classThis = /** @class */ (function () {
        function CredentialsController_1(exploreSvc, crypto) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.crypto = crypto;
        }
        /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
        CredentialsController_1.prototype.numericId = function (raw) {
            var n = Number(raw);
            if (!Number.isFinite(n))
                throw new common_1.BadRequestException('invalid id');
            return n;
        };
        // ---------- 凭据管理（B3 引擎 + 管理界面数据源） ----------
        CredentialsController_1.prototype.listCredentials = function (projectId) {
            return __awaiter(this, void 0, void 0, function () {
                var raw, pid, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            raw = (projectId !== null && projectId !== void 0 ? projectId : '').trim();
                            pid = raw === '' ? 1 : this.numericId(raw);
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, short_id, name, role, type, created_at\n       FROM credential WHERE project_id = $1 ORDER BY created_at DESC", [pid])];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, { items: r.rows }];
                    }
                });
            });
        };
        CredentialsController_1.prototype.addCredential = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var payloadEnc, shortId, r;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _d.sent();
                            // 必填缺失 → 400（而非 PG NOT NULL 裸 500）
                            if (!(body === null || body === void 0 ? void 0 : body.name) || !String(body.name).trim())
                                throw new common_1.BadRequestException('name required');
                            payloadEnc = this.crypto.encrypt(JSON.stringify({
                                username: body.username, password: body.password,
                            }));
                            shortId = "cred_".concat(Math.random().toString(36).slice(2, 8));
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO credential(short_id, project_id, name, role, type, payload_enc)\n       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [shortId, Number((_a = body === null || body === void 0 ? void 0 : body.projectId) !== null && _a !== void 0 ? _a : 1), body.name, (_b = body.role) !== null && _b !== void 0 ? _b : '管理员', (_c = body.kind) !== null && _c !== void 0 ? _c : 'form', payloadEnc])];
                        case 2:
                            r = _d.sent();
                            return [2 /*return*/, { id: r.rows[0].id }];
                    }
                });
            });
        };
        /** 编辑/轮换：更新加密值并打轮换时间戳（rotated_at）；不存在 → 404（0 行更新不再假成功） */
        CredentialsController_1.prototype.updCredential = function (id, body) {
            return __awaiter(this, void 0, void 0, function () {
                var credId, exists, sets, vals, cur, curVals, merged;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _c.sent();
                            credId = this.numericId(id);
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM credential WHERE id = $1", [credId])];
                        case 2:
                            exists = _c.sent();
                            if (exists.rows.length === 0)
                                throw new common_1.NotFoundException('not found');
                            sets = [];
                            vals = [credId];
                            if (body === null || body === void 0 ? void 0 : body.name) {
                                sets.push("name = $".concat(vals.length + 1));
                                vals.push(body.name);
                            }
                            if (body === null || body === void 0 ? void 0 : body.role) {
                                sets.push("role = $".concat(vals.length + 1));
                                vals.push(body.role);
                            }
                            if (!((body === null || body === void 0 ? void 0 : body.username) || (body === null || body === void 0 ? void 0 : body.password))) return [3 /*break*/, 4];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT payload_enc FROM credential WHERE id = $1", [credId])];
                        case 3:
                            cur = _c.sent();
                            curVals = cur.rows.length > 0
                                ? JSON.parse(this.crypto.decrypt(cur.rows[0].payload_enc))
                                : {};
                            merged = { username: (_a = body.username) !== null && _a !== void 0 ? _a : curVals.username, password: (_b = body.password) !== null && _b !== void 0 ? _b : curVals.password };
                            sets.push("payload_enc = $".concat(vals.length + 1));
                            vals.push(this.crypto.encrypt(JSON.stringify(merged)));
                            sets.push("rotated_at = now()");
                            _c.label = 4;
                        case 4:
                            if (sets.length === 0)
                                return [2 /*return*/, { ok: false, reason: 'no fields to update' }];
                            vals.unshift(credId);
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE credential SET ".concat(sets.join(', '), " WHERE id = $1"), vals)];
                        case 5:
                            _c.sent();
                            return [2 /*return*/, { ok: true, rotated: !!((body === null || body === void 0 ? void 0 : body.username) || (body === null || body === void 0 ? void 0 : body.password)) }];
                    }
                });
            });
        };
        CredentialsController_1.prototype.delCredential = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var credId, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            credId = this.numericId(id);
                            return [4 /*yield*/, this.exploreSvc.pg.query("DELETE FROM credential WHERE id = $1 RETURNING id", [credId])];
                        case 2:
                            r = _a.sent();
                            // 0 行删除 → 404（不再假成功）
                            if (r.rowCount === 0)
                                throw new common_1.NotFoundException('not found');
                            return [2 /*return*/, { ok: true }];
                    }
                });
            });
        };
        return CredentialsController_1;
    }());
    __setFunctionName(_classThis, "CredentialsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _listCredentials_decorators = [(0, common_1.Get)('credentials')];
        _addCredential_decorators = [(0, common_1.Post)('credentials')];
        _updCredential_decorators = [(0, common_1.Put)('credentials/:id')];
        _delCredential_decorators = [(0, common_1.Delete)('credentials/:id')];
        __esDecorate(_classThis, null, _listCredentials_decorators, { kind: "method", name: "listCredentials", static: false, private: false, access: { has: function (obj) { return "listCredentials" in obj; }, get: function (obj) { return obj.listCredentials; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _addCredential_decorators, { kind: "method", name: "addCredential", static: false, private: false, access: { has: function (obj) { return "addCredential" in obj; }, get: function (obj) { return obj.addCredential; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updCredential_decorators, { kind: "method", name: "updCredential", static: false, private: false, access: { has: function (obj) { return "updCredential" in obj; }, get: function (obj) { return obj.updCredential; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _delCredential_decorators, { kind: "method", name: "delCredential", static: false, private: false, access: { has: function (obj) { return "delCredential" in obj; }, get: function (obj) { return obj.delCredential; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CredentialsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CredentialsController = _classThis;
}();
exports.CredentialsController = CredentialsController;
