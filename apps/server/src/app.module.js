"use strict";
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
var common_1 = require("@nestjs/common");
var pg_1 = require("pg");
var agent_core_1 = require("@verifyos/agent-core");
var runs_controller_1 = require("./runs/runs.controller");
var overview_controller_1 = require("./overview.controller");
var webhooks_controller_1 = require("./webhooks.controller");
var tools_controller_1 = require("./tools.controller");
var explore_service_1 = require("./explore/explore.service");
var explore_controller_1 = require("./explore/explore.controller");
var explore_control_controller_1 = require("./explore/explore-control.controller");
var graph_controller_1 = require("./explore/graph.controller");
var qa_points_controller_1 = require("./explore/qa-points.controller");
var verifications_controller_1 = require("./explore/verifications.controller");
var browser_states_controller_1 = require("./explore/browser-states.controller");
var imports_controller_1 = require("./explore/imports.controller");
var credentials_controller_1 = require("./explore/credentials.controller");
var chat_controller_1 = require("./chat/chat.controller");
var issues_controller_1 = require("./issues.controller");
var mrs_controller_1 = require("./mrs.controller");
var mobile_controller_1 = require("./mobile.controller");
var health_controller_1 = require("./health.controller");
var runs_gateway_1 = require("./runs/runs.gateway");
var runs_service_1 = require("./runs/runs.service");
var llm_service_1 = require("./llm/llm.service");
var AppModule = function () {
    var _classDecorators = [(0, common_1.Module)({
            controllers: [health_controller_1.HealthController, runs_controller_1.RunsController, overview_controller_1.OverviewController, webhooks_controller_1.WebhooksController, tools_controller_1.ToolsController, explore_controller_1.ExploreController, explore_control_controller_1.ExploreControlController, graph_controller_1.GraphController, qa_points_controller_1.QaPointsController, verifications_controller_1.VerificationsController, browser_states_controller_1.BrowserStatesController, imports_controller_1.ImportsController, credentials_controller_1.CredentialsController, chat_controller_1.ChatController, issues_controller_1.IssuesController, mrs_controller_1.MrsController, mobile_controller_1.MobileController],
            providers: [
                runs_gateway_1.RunsGateway,
                runs_service_1.RunsService,
                llm_service_1.LlmService,
                // B3：全局 ApprovalManager 单例（WS 门控桥与 worker 共用）
                { provide: agent_core_1.ApprovalManager, useFactory: function () { return new agent_core_1.ApprovalManager(); } },
                // B3：凭据加解密（CREDENTIAL_ENCRYPTION_KEY 必填）
                {
                    provide: agent_core_1.CredentialCrypto,
                    useFactory: function () {
                        var key = process.env.CREDENTIAL_ENCRYPTION_KEY;
                        if (!key)
                            throw new Error('缺少 CREDENTIAL_ENCRYPTION_KEY（64 位 hex）');
                        return new agent_core_1.CredentialCrypto(key);
                    },
                },
                { provide: pg_1.Pool, useFactory: function () { return new pg_1.Pool({ connectionString: process.env.DATABASE_URL }); } },
                // F15：ToolRegistry 单例（E1 引擎接入运行时——权限门控 + 审计落库）
                {
                    provide: agent_core_1.ToolRegistry,
                    inject: [agent_core_1.ApprovalManager, pg_1.Pool],
                    useFactory: tools_controller_1.createToolRegistry,
                },
                explore_service_1.ExploreService,
            ],
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var AppModule = _classThis = /** @class */ (function () {
        function AppModule_1() {
        }
        return AppModule_1;
    }());
    __setFunctionName(_classThis, "AppModule");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AppModule = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AppModule = _classThis;
}();
exports.AppModule = AppModule;
