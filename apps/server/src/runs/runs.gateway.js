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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunsGateway = void 0;
var websockets_1 = require("@nestjs/websockets");
var shared_1 = require("@verifyos/shared");
/**
 * Run 事件流 + Approval 门控 Gateway。
 * - run.watch：订阅 runId 后推送事件流（C4 接 Orchestrator 真实 Run，当前演示流验证协议端到端）
 * - approval.*：B3 凭据动态表单——worker 侧 approvals.request() 触发 'requested'，
 *   这里广播 'approval.requested' 给所有客户端弹卡；客户端 'approval.submit' 回传后 resolve 门控。
 */
var RunsGateway = function () {
    var _classDecorators = [(0, websockets_1.WebSocketGateway)({ cors: true, path: '/ws' })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _server_decorators;
    var _server_initializers = [];
    var _server_extraInitializers = [];
    var _submit_decorators;
    var _pending_decorators;
    var _watch_decorators;
    var RunsGateway = _classThis = /** @class */ (function () {
        function RunsGateway_1(approvals, runs, explore) {
            this.approvals = (__runInitializers(this, _instanceExtraInitializers), approvals);
            this.runs = runs;
            this.explore = explore;
            this.server = __runInitializers(this, _server_initializers, void 0);
            __runInitializers(this, _server_extraInitializers);
            this.approvals = approvals;
            this.runs = runs;
            this.explore = explore;
        }
        RunsGateway_1.prototype.onModuleInit = function () {
            var _this = this;
            // worker 发起门控 → 广播弹卡（MVP 广播全员；后续按 runId/projectId 房间隔离）
            this.approvals.on('requested', function (req) {
                _this.server.emit('approval.requested', req);
            });
            this.approvals.on('resolved', function (id, resolution) {
                _this.server.emit('approval.resolved', { id: id, approved: resolution.approved });
            });
            // C1：真实 Run 事件流 + 完成摘要广播
            this.runs.on('run.event', function (e) {
                _this.server.emit('run.event', e);
            });
            this.runs.on('run.done', function (summary) {
                _this.server.emit('run.done', summary);
            });
            this.explore.on('explore.event', function (e) {
                _this.server.emit('explore.event', e);
            });
        };
        RunsGateway_1.prototype.submit = function (body) {
            var _a;
            var ok = this.approvals.submit(body.id, body.approved
                ? { approved: true, values: (_a = body.values) !== null && _a !== void 0 ? _a : {} }
                : { approved: false, reason: 'rejected_by_user' });
            return { ok: ok };
        };
        RunsGateway_1.prototype.pending = function () {
            return { items: this.approvals.listPending() };
        };
        RunsGateway_1.prototype.watch = function (body, client) {
            var runId = (body === null || body === void 0 ? void 0 : body.runId) || 'run_demo';
            var target = {
                applicationShortId: 'app_demo',
                platform: 'web',
                environment: { url: 'https://crm.test.example.com', isPreview: false },
            };
            var demo = [
                shared_1.ev.runStarted(runId, target),
                shared_1.ev.stepStarted(runId, 'st_01', 0, '管理员登录', 'module'),
                shared_1.ev.thinking(runId, 'st_01', '复用浏览器状态 admin_logged_in，免重复登录'),
                shared_1.ev.action(runId, 'st_01', 'browser', 'navigate', { url: '/employees' }),
                shared_1.ev.observation(runId, 'st_01', true, '员工列表页加载完成', 412),
                shared_1.ev.stepCompleted(runId, 'st_01', 'pass', true),
                shared_1.ev.runCompleted(runId, 'pass'),
            ];
            demo.forEach(function (e, i) { return setTimeout(function () { return client.emit('run.event', e); }, i * 300); });
            return { ok: true, runId: runId };
        };
        return RunsGateway_1;
    }());
    __setFunctionName(_classThis, "RunsGateway");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _server_decorators = [(0, websockets_1.WebSocketServer)()];
        _submit_decorators = [(0, websockets_1.SubscribeMessage)('approval.submit')];
        _pending_decorators = [(0, websockets_1.SubscribeMessage)('approval.pending')];
        _watch_decorators = [(0, websockets_1.SubscribeMessage)('run.watch')];
        __esDecorate(_classThis, null, _submit_decorators, { kind: "method", name: "submit", static: false, private: false, access: { has: function (obj) { return "submit" in obj; }, get: function (obj) { return obj.submit; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _pending_decorators, { kind: "method", name: "pending", static: false, private: false, access: { has: function (obj) { return "pending" in obj; }, get: function (obj) { return obj.pending; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _watch_decorators, { kind: "method", name: "watch", static: false, private: false, access: { has: function (obj) { return "watch" in obj; }, get: function (obj) { return obj.watch; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, null, _server_decorators, { kind: "field", name: "server", static: false, private: false, access: { has: function (obj) { return "server" in obj; }, get: function (obj) { return obj.server; }, set: function (obj, value) { obj.server = value; } }, metadata: _metadata }, _server_initializers, _server_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RunsGateway = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RunsGateway = _classThis;
}();
exports.RunsGateway = RunsGateway;
