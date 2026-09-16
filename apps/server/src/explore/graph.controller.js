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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphController = void 0;
var common_1 = require("@nestjs/common");
var agent_core_1 = require("@verifyos/agent-core");
var GraphController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _graph_decorators;
    var _graphCoverage_decorators;
    var GraphController = _classThis = /** @class */ (function () {
        function GraphController_1(exploreSvc) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
        }
        GraphController_1.prototype.graph = function (applicationId) {
            return __awaiter(this, void 0, void 0, function () {
                var store, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _b.sent();
                            store = new agent_core_1.GraphStore(this.exploreSvc.pg);
                            _a = [{ found: true, kind: this.exploreSvc.kind }];
                            return [4 /*yield*/, store.loadGraph(Number(applicationId !== null && applicationId !== void 0 ? applicationId : 1))];
                        case 2: return [2 /*return*/, __assign.apply(void 0, _a.concat([(_b.sent())]))];
                    }
                });
            });
        };
        // ---------- F9: 地图覆盖率 + 节点关联 ----------
        GraphController_1.prototype.graphCoverage = function () {
            return __awaiter(this, void 0, void 0, function () {
                var nodes, vers, runs, qas, pathOf, coveredPaths, pathsByVer, _i, _a, v, paths, _b, _c, s, verdictsByPath, _d, _e, r, _f, _g, p, statsByPath, _h, verdictsByPath_1, _j, p, list, qaByPath, _k, _l, q, p, out, matched;
                var _m, _o, _p, _q, _r, _s, _t, _u;
                return __generator(this, function (_v) {
                    switch (_v.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _v.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT ref, title, meta FROM graph_node WHERE application_id = 1 AND type = 'page' ORDER BY id")];
                        case 2:
                            nodes = _v.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT id, short_id, steps FROM verification")];
                        case 3:
                            vers = _v.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT verification_id, verdict, created_at FROM run ORDER BY created_at ASC NULLS LAST")];
                        case 4:
                            runs = _v.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT short_id, title, status, source FROM qa_point")];
                        case 5:
                            qas = _v.sent();
                            pathOf = function (u) { return (u !== null && u !== void 0 ? u : '').replace(/^https?:\/\/[^/]+/, '') || '/'; };
                            coveredPaths = new Set();
                            pathsByVer = new Map();
                            for (_i = 0, _a = vers.rows; _i < _a.length; _i++) {
                                v = _a[_i];
                                paths = new Set();
                                for (_b = 0, _c = (_m = v.steps) !== null && _m !== void 0 ? _m : []; _b < _c.length; _b++) {
                                    s = _c[_b];
                                    if (s.targetRef) {
                                        coveredPaths.add(pathOf(s.targetRef).replace(/^\//, ''));
                                        paths.add(pathOf(s.targetRef).replace(/^\//, ''));
                                    }
                                    if (((_o = s.assert) === null || _o === void 0 ? void 0 : _o.kind) === 'url_contains' && s.assert.value) {
                                        coveredPaths.add(pathOf(s.assert.value).replace(/^\//, ''));
                                        paths.add(pathOf(s.assert.value).replace(/^\//, ''));
                                    }
                                }
                                pathsByVer.set(v.id, paths);
                            }
                            verdictsByPath = new Map();
                            for (_d = 0, _e = runs.rows; _d < _e.length; _d++) {
                                r = _e[_d];
                                if (r.verification_id == null)
                                    continue;
                                for (_f = 0, _g = (_p = pathsByVer.get(r.verification_id)) !== null && _p !== void 0 ? _p : []; _f < _g.length; _f++) {
                                    p = _g[_f];
                                    verdictsByPath.set(p, __spreadArray(__spreadArray([], ((_q = verdictsByPath.get(p)) !== null && _q !== void 0 ? _q : []), true), [r.verdict], false));
                                }
                            }
                            statsByPath = new Map();
                            for (_h = 0, verdictsByPath_1 = verdictsByPath; _h < verdictsByPath_1.length; _h++) {
                                _j = verdictsByPath_1[_h], p = _j[0], list = _j[1];
                                statsByPath.set(p, { lastVerdict: (_r = list[list.length - 1]) !== null && _r !== void 0 ? _r : null, failCount: list.filter(function (x) { return x === 'fail'; }).length });
                            }
                            qaByPath = new Map();
                            for (_k = 0, _l = qas.rows; _k < _l.length; _k++) {
                                q = _l[_k];
                                p = pathOf(String((_t = (_s = q.source) === null || _s === void 0 ? void 0 : _s.sourceUrl) !== null && _t !== void 0 ? _t : '')).replace(/^\//, '');
                                if (!p)
                                    continue;
                                qaByPath.set(p, __spreadArray(__spreadArray([], ((_u = qaByPath.get(p)) !== null && _u !== void 0 ? _u : []), true), [{ shortId: q.short_id, title: q.title, status: q.status }], false));
                            }
                            out = nodes.rows.map(function (n) {
                                var _a, _b, _c, _d, _e, _f;
                                var p = pathOf(n.ref).replace(/^\//, '');
                                var covered = coveredPaths.has(p);
                                var related = (_a = qaByPath.get(p)) !== null && _a !== void 0 ? _a : [];
                                var vstat = (_b = statsByPath.get(p)) !== null && _b !== void 0 ? _b : null;
                                return {
                                    ref: n.ref, path: p || '/', title: n.title, intentBand: (_d = (_c = n.meta) === null || _c === void 0 ? void 0 : _c.intentBand) !== null && _d !== void 0 ? _d : null,
                                    covered: covered,
                                    qa: related,
                                    lastVerdict: (_e = vstat === null || vstat === void 0 ? void 0 : vstat.lastVerdict) !== null && _e !== void 0 ? _e : null, failCount: (_f = vstat === null || vstat === void 0 ? void 0 : vstat.failCount) !== null && _f !== void 0 ? _f : 0,
                                };
                            });
                            matched = out.filter(function (n) { return n.covered; }).length;
                            return [2 /*return*/, {
                                    coverage: { total: out.length, matched: matched, pct: out.length ? Math.round((matched / out.length) * 100) : 0 },
                                    nodes: out,
                                }];
                    }
                });
            });
        };
        return GraphController_1;
    }());
    __setFunctionName(_classThis, "GraphController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _graph_decorators = [(0, common_1.Get)('graph')];
        _graphCoverage_decorators = [(0, common_1.Get)('graph/coverage')];
        __esDecorate(_classThis, null, _graph_decorators, { kind: "method", name: "graph", static: false, private: false, access: { has: function (obj) { return "graph" in obj; }, get: function (obj) { return obj.graph; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _graphCoverage_decorators, { kind: "method", name: "graphCoverage", static: false, private: false, access: { has: function (obj) { return "graphCoverage" in obj; }, get: function (obj) { return obj.graphCoverage; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        GraphController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return GraphController = _classThis;
}();
exports.GraphController = GraphController;
