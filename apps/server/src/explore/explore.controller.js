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
exports.ExploreController = void 0;
var common_1 = require("@nestjs/common");
var ExploreController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _explore_decorators;
    var _addProject_decorators;
    var _listProjects_decorators;
    var _exploreControl_decorators;
    var _explorePause_decorators;
    var _exploreStop_decorators;
    var ExploreController = _classThis = /** @class */ (function () {
        function ExploreController_1(exploreSvc, runs) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.runs = runs;
        }
        /** 一键探索闭环（异步；进度走 WS explore.event） */
        ExploreController_1.prototype.explore = function (body) {
            var _this = this;
            var _a;
            var input = {
                startUrl: (_a = body === null || body === void 0 ? void 0 : body.startUrl) !== null && _a !== void 0 ? _a : this.runs.fixtureEntryUrl,
                intent: body === null || body === void 0 ? void 0 : body.intent,
                credential: body === null || body === void 0 ? void 0 : body.credential,
                headful: body === null || body === void 0 ? void 0 : body.headful, // G10: headful 人工接管模式
                maxDepth: body === null || body === void 0 ? void 0 : body.maxDepth, // G10: 探索参数贯通
                maxPages: body === null || body === void 0 ? void 0 : body.maxPages, // J03: maxPages 正式契约
                maxActions: body === null || body === void 0 ? void 0 : body.maxActions, // J03: 旧别名兼容
            };
            void this.exploreSvc.explore(input, function (e) {
                console.log('[explore]', e.phase, '-', e.message);
                _this.exploreSvc.emit('explore.event', e);
            });
            return { accepted: true };
        };
        // ---------- F1: 新建项目（欢迎屏 → 开始探索） ----------
        ExploreController_1.prototype.addProject = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var name, prj, app;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _d.sent();
                            name = ((_a = body === null || body === void 0 ? void 0 : body.name) !== null && _a !== void 0 ? _a : '').trim() || '未命名项目';
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO project(short_id, org_id, name) VALUES ($1, 1, $2) RETURNING id", ["prj_".concat(Math.random().toString(36).slice(2, 8)), name])];
                        case 2:
                            prj = _d.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO application(short_id, project_id, name, type) VALUES ($1, $2, $3, 'web') RETURNING id", ["app_".concat(Math.random().toString(36).slice(2, 8)), prj.rows[0].id, name])];
                        case 3:
                            app = _d.sent();
                            return [2 /*return*/, {
                                    ok: true, projectId: prj.rows[0].id, applicationId: app.rows[0].id,
                                    env: (_b = body === null || body === void 0 ? void 0 : body.env) !== null && _b !== void 0 ? _b : '测试环境', url: (_c = body === null || body === void 0 ? void 0 : body.url) !== null && _c !== void 0 ? _c : '',
                                    note: 'env 维度当前为展示占位（environment 表绑定属 B1 后续）',
                                }];
                    }
                });
            });
        };
        /** H09 集成：项目列表（侧栏项目切换器数据源，与 POST /api/projects 同型） */
        ExploreController_1.prototype.listProjects = function () {
            return __awaiter(this, void 0, void 0, function () {
                var rs;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT short_id, name FROM project ORDER BY id DESC LIMIT 50")];
                        case 2:
                            rs = _a.sent();
                            return [2 /*return*/, { ok: true, projects: rs.rows }];
                    }
                });
            });
        };
        // ---------- F4: 人工接管 + Live Findings ----------
        /** 探索控制状态（轮询/初载用；实时流走 WS explore.event）
         *  J03-9: ?explorationId=exp_xxx&since=n → 返回该会话 since 之后的事件（断线补看） */
        ExploreController_1.prototype.exploreControl = function (explorationId, since) {
            return this.exploreSvc.controlState({
                explorationId: explorationId || undefined,
                since: since != null && since !== '' && Number.isFinite(Number(since)) ? Number(since) : undefined,
            });
        };
        /** J03-7: 空闲态守卫——无活动探索返回 400（定向 stop 可带 explorationId） */
        ExploreController_1.prototype.explorePause = function (body) {
            var n = this.exploreSvc.setPaused(!!(body === null || body === void 0 ? void 0 : body.on), (body === null || body === void 0 ? void 0 : body.explorationId) || undefined);
            if (n === 0)
                throw new common_1.HttpException({ error: 'no active exploration' }, 400);
            return { ok: true, paused: !!(body === null || body === void 0 ? void 0 : body.on), sessions: n };
        };
        /** J03-2/7: stop 语义修正——置位后 QA 提取跳过并发 stopped 终态事件；
         *  空闲态返回 400；不带 explorationId 时停所有活动会话（旧全局语义兼容） */
        ExploreController_1.prototype.exploreStop = function (body) {
            var n = this.exploreSvc.stop((body === null || body === void 0 ? void 0 : body.explorationId) || undefined);
            if (n === 0)
                throw new common_1.HttpException({ error: 'no active exploration' }, 400);
            return { ok: true, stopped: n, note: '已停止——已爬页面照常落库，QA 提取跳过' };
        };
        return ExploreController_1;
    }());
    __setFunctionName(_classThis, "ExploreController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _explore_decorators = [(0, common_1.Post)('explore')];
        _addProject_decorators = [(0, common_1.Post)('projects')];
        _listProjects_decorators = [(0, common_1.Get)('projects')];
        _exploreControl_decorators = [(0, common_1.Get)('explore/control')];
        _explorePause_decorators = [(0, common_1.Post)('explore/pause')];
        _exploreStop_decorators = [(0, common_1.Post)('explore/stop')];
        __esDecorate(_classThis, null, _explore_decorators, { kind: "method", name: "explore", static: false, private: false, access: { has: function (obj) { return "explore" in obj; }, get: function (obj) { return obj.explore; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _addProject_decorators, { kind: "method", name: "addProject", static: false, private: false, access: { has: function (obj) { return "addProject" in obj; }, get: function (obj) { return obj.addProject; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _listProjects_decorators, { kind: "method", name: "listProjects", static: false, private: false, access: { has: function (obj) { return "listProjects" in obj; }, get: function (obj) { return obj.listProjects; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _exploreControl_decorators, { kind: "method", name: "exploreControl", static: false, private: false, access: { has: function (obj) { return "exploreControl" in obj; }, get: function (obj) { return obj.exploreControl; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _explorePause_decorators, { kind: "method", name: "explorePause", static: false, private: false, access: { has: function (obj) { return "explorePause" in obj; }, get: function (obj) { return obj.explorePause; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _exploreStop_decorators, { kind: "method", name: "exploreStop", static: false, private: false, access: { has: function (obj) { return "exploreStop" in obj; }, get: function (obj) { return obj.exploreStop; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ExploreController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ExploreController = _classThis;
}();
exports.ExploreController = ExploreController;
