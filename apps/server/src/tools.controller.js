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
exports.ToolsController = void 0;
exports.createToolRegistry = createToolRegistry;
var common_1 = require("@nestjs/common");
var agent_core_1 = require("@verifyos/agent-core");
/**
 * F15：工具与插件屏后端 —— ToolRegistry 单例接入（E1 引擎首次进入运行时）。
 * GET  /api/tools        → registry.list()（8 内置工具 + 权限档）
 * POST /api/tools/invoke → registry.invoke（仅 auto 档；ask 须经 Run 内人工批准流，forbidden 禁用）
 * GET  /api/tools/audit  → audit_log 表最近 50 条（onAudit 落库；PG 不可用回退内存态）
 */
/** registry 单例：注入全局 ApprovalManager（B3），内置 8 工具（E1） */
function createToolRegistry(approvals, pool) {
    var registry = new agent_core_1.ToolRegistry(approvals);
    (0, agent_core_1.registerBuiltinTools)(registry);
    // 审计持久化：fire-and-forget，落 audit_log（action=tool.call，完整条目进 meta）
    registry.onAudit(function (entry) {
        pool
            .query("INSERT INTO audit_log (actor, action, target, meta)\n         VALUES ($1, 'tool.call', $2, $3::jsonb)", ['system', entry.tool, JSON.stringify(entry)])
            .catch(function () { return undefined; }); // 审计落库失败不影响主流程（内存态仍在）
    });
    return registry;
}
var ToolsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/tools')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _tools_decorators;
    var _invoke_decorators;
    var _audit_decorators;
    var ToolsController = _classThis = /** @class */ (function () {
        function ToolsController_1(registry, pool) {
            this.registry = (__runInitializers(this, _instanceExtraInitializers), registry);
            this.pool = pool;
        }
        ToolsController_1.prototype.tools = function () {
            return __awaiter(this, void 0, void 0, function () {
                var usage, r, _i, _a, row, _b, _c, _d, e;
                var _e;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0:
                            usage = {};
                            _f.label = 1;
                        case 1:
                            _f.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.pool.query("SELECT target AS tool, COUNT(*)::int AS n FROM audit_log\n         WHERE created_at > now() - interval '24 hours' AND action = 'tool.call'\n         GROUP BY target")];
                        case 2:
                            r = _f.sent();
                            for (_i = 0, _a = r.rows; _i < _a.length; _i++) {
                                row = _a[_i];
                                usage[row.tool] = row.n;
                            }
                            return [3 /*break*/, 4];
                        case 3:
                            _b = _f.sent();
                            // PG 不可用：回退内存态审计计数（仅本进程）
                            for (_c = 0, _d = this.registry.audit(); _c < _d.length; _c++) {
                                e = _d[_c];
                                if (e.tool)
                                    usage[e.tool] = ((_e = usage[e.tool]) !== null && _e !== void 0 ? _e : 0) + 1;
                            }
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/, { tools: this.registry.list().map(function (t) { var _a; return (__assign(__assign({}, t), { usage24h: (_a = usage[t.name]) !== null && _a !== void 0 ? _a : 0 })); }) }];
                    }
                });
            });
        };
        ToolsController_1.prototype.invoke = function (dto) {
            return __awaiter(this, void 0, void 0, function () {
                var name, def, ctx, result;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            name = String((_a = dto.name) !== null && _a !== void 0 ? _a : '');
                            def = this.registry.get(name);
                            if (!def)
                                throw new common_1.BadRequestException("\u672A\u77E5\u5DE5\u5177 ".concat(name));
                            if (def.permission !== 'auto') {
                                // ask 工具的调用入口在 Run 执行流（弹卡批准）；屏上直调仅开放 auto 档
                                throw new common_1.BadRequestException("\u5DE5\u5177 ".concat(name, " \u6743\u9650\u4E3A ").concat(def.permission, "\uFF0C\u4EC5 auto \u6863\u652F\u6301\u5C4F\u4E0A\u8BD5\u8FD0\u884C\uFF08ask \u9700\u7ECF Run \u5185\u4EBA\u5DE5\u6279\u51C6\uFF09"));
                            }
                            ctx = { pool: this.pool };
                            return [4 /*yield*/, this.registry.invoke(name, (_b = dto.args) !== null && _b !== void 0 ? _b : {}, ctx)];
                        case 1:
                            result = _c.sent();
                            return [2 /*return*/, result];
                    }
                });
            });
        };
        ToolsController_1.prototype.audit = function () {
            return __awaiter(this, void 0, void 0, function () {
                var r, items, _a, items;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.pool.query("SELECT meta, created_at FROM audit_log WHERE action = 'tool.call' ORDER BY id DESC LIMIT 50")];
                        case 1:
                            r = _b.sent();
                            items = r.rows.map(function (row) { return (__assign(__assign({}, row.meta), { ts: row.created_at })); });
                            return [2 /*return*/, { source: 'db', items: items }];
                        case 2:
                            _a = _b.sent();
                            items = this.registry.audit().slice(-50).reverse();
                            return [2 /*return*/, { source: 'memory', items: items }];
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        return ToolsController_1;
    }());
    __setFunctionName(_classThis, "ToolsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _tools_decorators = [(0, common_1.Get)()];
        _invoke_decorators = [(0, common_1.Post)('invoke')];
        _audit_decorators = [(0, common_1.Get)('audit')];
        __esDecorate(_classThis, null, _tools_decorators, { kind: "method", name: "tools", static: false, private: false, access: { has: function (obj) { return "tools" in obj; }, get: function (obj) { return obj.tools; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _invoke_decorators, { kind: "method", name: "invoke", static: false, private: false, access: { has: function (obj) { return "invoke" in obj; }, get: function (obj) { return obj.invoke; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _audit_decorators, { kind: "method", name: "audit", static: false, private: false, access: { has: function (obj) { return "audit" in obj; }, get: function (obj) { return obj.audit; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ToolsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ToolsController = _classThis;
}();
exports.ToolsController = ToolsController;
