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
exports.ChatController = void 0;
var common_1 = require("@nestjs/common");
var chat_service_1 = require("./chat.service");
/**
 * AI 工作区（C 系 chat 屏引擎）：自然语言 → 意图解析 → 能力调度。
 * 前端收到 plan 后自动执行对应动作并渲染卡片；chat 类直接展示 reply。
 */
var ChatController = function () {
    var _classDecorators = [(0, common_1.Controller)('api/chat')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _history_decorators;
    var _send_decorators;
    var ChatController = _classThis = /** @class */ (function () {
        function ChatController_1(exploreSvc, runs) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.runs = runs;
        }
        /** 对话历史（PG 持久化，刷新不丢）；limit NaN → 400，负数 clamp 到 1（J01 任务2） */
        ChatController_1.prototype.history = function (limit) {
            return __awaiter(this, void 0, void 0, function () {
                var n, lim, r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            n = Number(limit !== null && limit !== void 0 ? limit : 50);
                            if (!Number.isFinite(n))
                                throw new common_1.BadRequestException('invalid limit');
                            lim = Math.max(1, Math.min(Math.floor(n), 200));
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT role, content, card, created_at FROM chat_message\n       WHERE session_id = 'default' ORDER BY created_at DESC LIMIT $1", [lim])];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, { items: r.rows.reverse() }];
                    }
                });
            });
        };
        ChatController_1.prototype.send = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var message, llm, plan, raw, startUrl;
                var _this = this;
                var _a, _b, _c, _d, _e, _f, _g;
                return __generator(this, function (_h) {
                    switch (_h.label) {
                        case 0:
                            message = String((_a = body === null || body === void 0 ? void 0 : body.message) !== null && _a !== void 0 ? _a : '').slice(0, 500);
                            llm = {
                                apiKey: (_b = process.env.LLM_API_KEY) !== null && _b !== void 0 ? _b : '',
                                baseURL: (_c = process.env.LLM_BASE_URL) !== null && _c !== void 0 ? _c : 'https://open.bigmodel.cn/api/paas/v4',
                                model: (_d = process.env.LLM_MODEL) !== null && _d !== void 0 ? _d : 'glm-4.5v',
                            };
                            return [4 /*yield*/, (0, chat_service_1.parseChatIntent)(message || '你好', llm)];
                        case 1:
                            plan = _h.sent();
                            // 持久化：user + assistant 两条（card 由前端根据 dispatched 补，这里存 plan 摘要）
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 2:
                            // 持久化：user + assistant 两条（card 由前端根据 dispatched 补，这里存 plan 摘要）
                            _h.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO chat_message(session_id, role, content) VALUES('default', 'user', $1)", [message])];
                        case 3:
                            _h.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO chat_message(session_id, role, content, card) VALUES('default', 'assistant', $1, $2::jsonb)", [plan.reply, JSON.stringify({ action: plan.action, dispatched: (_e = plan.dispatched) !== null && _e !== void 0 ? _e : null, intent_text: (_f = plan.intent_text) !== null && _f !== void 0 ? _f : null })])];
                        case 4:
                            _h.sent();
                            // 服务端直接调度（异步）：explore / run_tests 立即触发，前端靠 WS 收进度
                            if (plan.action === 'explore') {
                                raw = (_g = plan.target_url) !== null && _g !== void 0 ? _g : this.runs.fixtureEntryUrl;
                                startUrl = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(raw) && raw !== this.runs.fixtureEntryUrl && !raw.includes(new URL(this.runs.fixtureEntryUrl).port)
                                    ? this.runs.fixtureEntryUrl
                                    : raw;
                                void this.exploreSvc.explore({ startUrl: startUrl, intent: plan.intent_text, credential: { username: 'admin', password: 'test123' } }, function (e) { return _this.exploreSvc.emit('explore.event', e); });
                                plan.dispatched = 'explore';
                            }
                            else if (plan.action === 'run_tests') {
                                void this.runs.trigger({});
                                plan.dispatched = 'run';
                            }
                            return [2 /*return*/, { plan: plan }];
                    }
                });
            });
        };
        return ChatController_1;
    }());
    __setFunctionName(_classThis, "ChatController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _history_decorators = [(0, common_1.Get)('history')];
        _send_decorators = [(0, common_1.Post)()];
        __esDecorate(_classThis, null, _history_decorators, { kind: "method", name: "history", static: false, private: false, access: { has: function (obj) { return "history" in obj; }, get: function (obj) { return obj.history; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _send_decorators, { kind: "method", name: "send", static: false, private: false, access: { has: function (obj) { return "send" in obj; }, get: function (obj) { return obj.send; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ChatController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ChatController = _classThis;
}();
exports.ChatController = ChatController;
