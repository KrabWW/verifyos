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
exports.MobileController = void 0;
var common_1 = require("@nestjs/common");
/**
 * G15：移动测试详情页数据源。
 * - GET /api/mobile/runs/:id/outputs → output_value 表（Agent 显式保存的 Output Values，按 run short_id 关联）
 * - GET /api/mobile/runs/:id/meta    → 设备信息（run.output.device / target.platform）+ Classification + 最近 5 次同 VER Run
 */
var MobileController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/mobile')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _outputs_decorators;
    var _meta_decorators;
    var MobileController = _classThis = /** @class */ (function () {
        function MobileController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        MobileController_1.prototype.outputs = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var run, r, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _b.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 2:
                            run = _b.sent();
                            if (run.rows.length === 0)
                                return [2 /*return*/, { found: false, items: [] }];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT key, value, created_at FROM output_value WHERE run_id = $1 ORDER BY id", [run.rows[0].id])];
                        case 3:
                            r = _b.sent();
                            return [2 /*return*/, { found: true, items: r.rows }];
                        case 4:
                            _a = _b.sent();
                            return [2 /*return*/, { found: false, items: [] }];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        };
        MobileController_1.prototype.meta = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var run, row, output, target, recentRuns, r, _a;
                var _b, _c, _d, _e, _f, _g;
                return __generator(this, function (_h) {
                    switch (_h.label) {
                        case 0:
                            _h.trys.push([0, 5, , 6]);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _h.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, verification_id, target, output FROM run WHERE short_id = $1 LIMIT 1", [id])];
                        case 2:
                            run = _h.sent();
                            if (run.rows.length === 0)
                                return [2 /*return*/, { found: false }];
                            row = run.rows[0];
                            output = (_b = row.output) !== null && _b !== void 0 ? _b : {};
                            target = (_c = row.target) !== null && _c !== void 0 ? _c : {};
                            recentRuns = [];
                            if (!row.verification_id) return [3 /*break*/, 4];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT short_id, verdict, created_at FROM run\n           WHERE verification_id = $1 AND short_id <> $2\n           ORDER BY id DESC LIMIT 5", [row.verification_id, id])];
                        case 3:
                            r = _h.sent();
                            recentRuns = r.rows.map(function (x) { return ({
                                runId: x.short_id,
                                verdict: x.verdict,
                                createdAt: x.created_at,
                            }); });
                            _h.label = 4;
                        case 4: return [2 /*return*/, {
                                found: true,
                                device: (_d = output.device) !== null && _d !== void 0 ? _d : null,
                                platform: (_e = target.platform) !== null && _e !== void 0 ? _e : 'web',
                                ua: (_f = output.ua) !== null && _f !== void 0 ? _f : null,
                                // Classification：run 表暂无分类字段（triage 侧数据未回写 run）——诚实返回 null
                                classification: (_g = output.classification) !== null && _g !== void 0 ? _g : null,
                                recentRuns: recentRuns,
                            }];
                        case 5:
                            _a = _h.sent();
                            return [2 /*return*/, { found: false }];
                        case 6: return [2 /*return*/];
                    }
                });
            });
        };
        return MobileController_1;
    }());
    __setFunctionName(_classThis, "MobileController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _outputs_decorators = [(0, common_1.Get)('runs/:id/outputs')];
        _meta_decorators = [(0, common_1.Get)('runs/:id/meta')];
        __esDecorate(_classThis, null, _outputs_decorators, { kind: "method", name: "outputs", static: false, private: false, access: { has: function (obj) { return "outputs" in obj; }, get: function (obj) { return obj.outputs; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _meta_decorators, { kind: "method", name: "meta", static: false, private: false, access: { has: function (obj) { return "meta" in obj; }, get: function (obj) { return obj.meta; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MobileController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MobileController = _classThis;
}();
exports.MobileController = MobileController;
