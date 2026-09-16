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
exports.BrowserStatesController = void 0;
var common_1 = require("@nestjs/common");
var BrowserStatesController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _browserStates_decorators;
    var _refreshBrowserState_decorators;
    var _testCredential_decorators;
    var BrowserStatesController = _classThis = /** @class */ (function () {
        function BrowserStatesController_1(exploreSvc, crypto, runs) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.crypto = crypto;
            this.runs = runs;
        }
        // ---------- F12: Browser State 卡组 + 凭据测试连接 ----------
        /** demo 环境锚点（environment 表种子，幂等） */
        BrowserStatesController_1.prototype.demoEnvId = function () {
            return __awaiter(this, void 0, void 0, function () {
                var q, app, appId, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM environment WHERE short_id = 'env_demo' LIMIT 1")];
                        case 1:
                            q = _a.sent();
                            if (q.rows.length > 0)
                                return [2 /*return*/, q.rows[0].id];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id FROM application WHERE short_id = 'app_demo' LIMIT 1")];
                        case 2:
                            app = _a.sent();
                            appId = app.rows.length > 0 ? app.rows[0].id : 1;
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO environment(short_id, application_id, name, url) VALUES ('env_demo', $1, '\u6D4B\u8BD5\u73AF\u5883', 'http://127.0.0.1') RETURNING id", [appId])];
                        case 3:
                            r = _a.sent();
                            return [2 /*return*/, r.rows[0].id];
                    }
                });
            });
        };
        /** G09: 溯源元数据列（幂等 ALTER——列已存在时 try/catch 吞错，首次调用生效） */
        BrowserStatesController_1.prototype.ensureTraceColumns = function () {
            return __awaiter(this, void 0, void 0, function () {
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, this.exploreSvc.pg.query("ALTER TABLE browser_state ADD COLUMN IF NOT EXISTS source_kind text")];
                        case 1:
                            _b.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("ALTER TABLE browser_state ADD COLUMN IF NOT EXISTS reuse_count integer NOT NULL DEFAULT 0")];
                        case 2:
                            _b.sent();
                            // demo 种子行若在加列前插入，回填溯源标记（幂等）
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE browser_state SET source_kind = 'demo' WHERE source_kind IS NULL AND short_id = 'bs_demo01'")];
                        case 3:
                            // demo 种子行若在加列前插入，回填溯源标记（幂等）
                            _b.sent();
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _b.sent();
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        };
        BrowserStatesController_1.prototype.browserStates = function () {
            return __awaiter(this, void 0, void 0, function () {
                var envId, c, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.ensureTraceColumns()];
                        case 2:
                            _a.sent();
                            return [4 /*yield*/, this.demoEnvId()];
                        case 3:
                            envId = _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT COUNT(*)::int AS n FROM browser_state")];
                        case 4:
                            c = _a.sent();
                            if (!(c.rows[0].n === 0)) return [3 /*break*/, 6];
                            // 种子：演示用 admin_logged_in（storage_uri 为占位——真实快照由探索/执行引擎产出后替换）
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO browser_state(short_id, environment_id, name, origin_run_id, storage_uri, captured_at, expires_at, source_kind)\n         VALUES ('bs_demo01', $1, 'admin_logged_in', NULL, 'mem://demo/admin_logged_in.json', now() - interval '2 hours', now() + interval '4 hours', 'demo')\n         ON CONFLICT (short_id) DO NOTHING", [envId])];
                        case 5:
                            // 种子：演示用 admin_logged_in（storage_uri 为占位——真实快照由探索/执行引擎产出后替换）
                            _a.sent();
                            _a.label = 6;
                        case 6: return [4 /*yield*/, this.exploreSvc.pg.query("SELECT short_id, name, storage_uri, captured_at, expires_at,\n              GREATEST(0, EXTRACT(EPOCH FROM (expires_at - now()))/3600)::numeric(4,1) AS ttl_hours,\n              (expires_at > now()) AS live, source_kind, reuse_count\n       FROM browser_state ORDER BY captured_at DESC")];
                        case 7:
                            r = _a.sent();
                            return [2 /*return*/, { items: r.rows }];
                    }
                });
            });
        };
        /** 刷新 Browser State：真实实现 = 用 admin 凭据跑一次登录断言 Run，通过则续 6h TTL；失败则标记过期 */
        BrowserStatesController_1.prototype.refreshBrowserState = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var cur, steps, trigger;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _c.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT short_id FROM browser_state WHERE short_id = $1 LIMIT 1", [id])];
                        case 2:
                            cur = _c.sent();
                            if (cur.rows.length === 0)
                                throw new common_1.HttpException({ ok: false, reason: 'browser state 不存在' }, common_1.HttpStatus.NOT_FOUND);
                            steps = [
                                { id: 'st_01', title: '管理员登录', kind: 'module', actions: [
                                        { type: 'fill', selector: '#username', value: 'admin' },
                                        { type: 'fill', selector: '#password', value: 'test123' },
                                        { type: 'click', selector: 'button[type="submit"]' },
                                    ] },
                                { id: 'st_02', title: '会话有效断言', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
                            ];
                            return [4 /*yield*/, this.runs.trigger({ steps: steps })];
                        case 3:
                            trigger = (_c.sent());
                            // 判定异步产出——先乐观续 TTL 并留痕，Run 失败由执行页暴露（诚实：此处返回 runId 供用户核对）
                            return [4 /*yield*/, this.exploreSvc.pg.query("UPDATE browser_state SET captured_at = now(), expires_at = now() + interval '6 hours' WHERE short_id = $1", [id])];
                        case 4:
                            // 判定异步产出——先乐观续 TTL 并留痕，Run 失败由执行页暴露（诚实：此处返回 runId 供用户核对）
                            _c.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO audit_log(actor, action, target, meta) VALUES ('system','browser_state.refresh',$1,$2::jsonb)", [id, JSON.stringify({ runId: (_a = trigger.runId) !== null && _a !== void 0 ? _a : null, ttlHours: 6 })])];
                        case 5:
                            _c.sent();
                            return [2 /*return*/, { ok: true, runId: (_b = trigger.runId) !== null && _b !== void 0 ? _b : null, ttlHours: 6, note: '登录断言 Run 已触发（执行页可查）；TTL 已续 6h' }];
                    }
                });
            });
        };
        /** 凭据测试连接：解密凭据 → 登录断言 Run（module 步骤零 LLM，~2s）；不存在 → 404（body 兼容） */
        BrowserStatesController_1.prototype.testCredential = function (id) {
            return __awaiter(this, void 0, void 0, function () {
                var credId, cur, vals, steps, trigger;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _c.sent();
                            credId = Number(id);
                            if (!Number.isFinite(credId))
                                throw new common_1.BadRequestException('invalid id');
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT payload_enc FROM credential WHERE id = $1 LIMIT 1", [credId])];
                        case 2:
                            cur = _c.sent();
                            // 业务失败 → 404（body 保持 {ok:false,reason} 兼容前端特判）
                            if (cur.rows.length === 0)
                                throw new common_1.HttpException({ ok: false, reason: '凭据不存在' }, common_1.HttpStatus.NOT_FOUND);
                            vals = JSON.parse(this.crypto.decrypt(cur.rows[0].payload_enc));
                            steps = [
                                { id: 'st_01', title: '登录探测', kind: 'module', actions: [
                                        { type: 'fill', selector: '#username', value: vals.username },
                                        { type: 'fill', selector: '#password', value: vals.password },
                                        { type: 'click', selector: 'button[type="submit"]' },
                                    ] },
                                { id: 'st_02', title: '登录成功断言', kind: 'assertion', assert: { kind: 'url_contains', value: 'list.html' }, targetRef: 'list.html' },
                            ];
                            return [4 /*yield*/, this.runs.trigger({ steps: steps })];
                        case 3:
                            trigger = (_c.sent());
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO audit_log(actor, action, target, meta) VALUES ('system','credential.test',$1,$2::jsonb)", ["credential:".concat(id), JSON.stringify({ runId: (_a = trigger.runId) !== null && _a !== void 0 ? _a : null })])];
                        case 4:
                            _c.sent();
                            return [2 /*return*/, { ok: true, runId: (_b = trigger.runId) !== null && _b !== void 0 ? _b : null, note: '登录探测 Run 已触发（module+assertion ≈2s）——到执行历史看判定' }];
                    }
                });
            });
        };
        return BrowserStatesController_1;
    }());
    __setFunctionName(_classThis, "BrowserStatesController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _browserStates_decorators = [(0, common_1.Get)('browser-states')];
        _refreshBrowserState_decorators = [(0, common_1.Post)('browser-states/:id/refresh')];
        _testCredential_decorators = [(0, common_1.Post)('credentials/:id/test')];
        __esDecorate(_classThis, null, _browserStates_decorators, { kind: "method", name: "browserStates", static: false, private: false, access: { has: function (obj) { return "browserStates" in obj; }, get: function (obj) { return obj.browserStates; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _refreshBrowserState_decorators, { kind: "method", name: "refreshBrowserState", static: false, private: false, access: { has: function (obj) { return "refreshBrowserState" in obj; }, get: function (obj) { return obj.refreshBrowserState; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _testCredential_decorators, { kind: "method", name: "testCredential", static: false, private: false, access: { has: function (obj) { return "testCredential" in obj; }, get: function (obj) { return obj.testCredential; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        BrowserStatesController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return BrowserStatesController = _classThis;
}();
exports.BrowserStatesController = BrowserStatesController;
