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
exports.ImportsController = void 0;
var common_1 = require("@nestjs/common");
var ImportsController = function () {
    var _classDecorators = [(0, common_1.Controller)('api')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _parseImport_decorators;
    var _ignoreFinding_decorators;
    var _listIgnores_decorators;
    var _crossCheck_decorators;
    var ImportsController = _classThis = /** @class */ (function () {
        function ImportsController_1(exploreSvc, llm) {
            this.exploreSvc = (__runInitializers(this, _instanceExtraInitializers), exploreSvc);
            this.llm = llm;
        }
        // ---------- F3: 需求导入（文本拆分 + 交叉验证；docx 解析/Figma/飞书连接器属 MCP 后续） ----------
        ImportsController_1.prototype.parseImport = function (body) {
            var _a, _b, _c, _d, _e;
            var text = ((_a = body === null || body === void 0 ? void 0 : body.text) !== null && _a !== void 0 ? _a : '').trim();
            if (!text)
                return { ok: false, reason: '文本为空' };
            var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
            var ruleRe = /^(?:业务规则|规则|R\d+)/;
            var critRe = /^(?:验收|验收标准|AC\d+)/;
            var roleRe = /角色[:：]\s*(.+)/;
            var domainRe = /^(?:#|模块[:：]|功能域[:：])\s*(.+)/;
            var rules = lines.filter(function (l) { return ruleRe.test(l) || /必须|不能|仅|只允许|应拒绝/.test(l); });
            var criteria = lines.filter(function (l) { return critRe.test(l); });
            var domains = lines.map(function (l) { var _a; return (_a = l.match(domainRe)) === null || _a === void 0 ? void 0 : _a[1]; }).filter(Boolean);
            // 角色行可能一行多角色（「管理员、普通用户」）——拆成独立角色名
            var roles = lines
                .map(function (l) { var _a; return (_a = l.match(roleRe)) === null || _a === void 0 ? void 0 : _a[1]; })
                .filter(Boolean)
                .flatMap(function (s) { return s.split(/[、，,\/]/).map(function (r) { return r.trim(); }).filter(Boolean); });
            var stateLine = lines.find(function (l) { return /状态机|状态流转/.test(l); });
            // F3-matrix：顺序扫描——规则归属最近出现的功能域；规则文本提及角色名则计入该角色列，否则计「通用」
            var FALLBACK_DOMAIN = '（未分模块）';
            var curDomain = (_b = domains[0]) !== null && _b !== void 0 ? _b : FALLBACK_DOMAIN;
            var domainRows = [];
            var roleCols = __spreadArray(__spreadArray([], roles, true), ['通用'], false);
            var cellMap = new Map(); // `${domain}||${role}` -> count
            var _loop_1 = function (l) {
                var dm = (_c = l.match(domainRe)) === null || _c === void 0 ? void 0 : _c[1];
                if (dm) {
                    curDomain = dm;
                    return "continue";
                }
                if (!(ruleRe.test(l) || /必须|不能|仅|只允许|应拒绝/.test(l)))
                    return "continue";
                if (!domainRows.includes(curDomain))
                    domainRows.push(curDomain);
                var mentioned = roles.filter(function (r) { return l.includes(r); });
                var cols = mentioned.length > 0 ? mentioned : ['通用'];
                for (var _f = 0, cols_1 = cols; _f < cols_1.length; _f++) {
                    var c = cols_1[_f];
                    var k = "".concat(curDomain, "||").concat(c);
                    cellMap.set(k, ((_d = cellMap.get(k)) !== null && _d !== void 0 ? _d : 0) + 1);
                }
            };
            for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                var l = lines_1[_i];
                _loop_1(l);
            }
            var matrixDomains = domainRows.length > 0 ? domainRows : (rules.length > 0 ? [curDomain] : []);
            var matrix = {
                domains: matrixDomains,
                roles: roleCols,
                cells: matrixDomains.map(function (d) { return roleCols.map(function (r) { var _a; return (_a = cellMap.get("".concat(d, "||").concat(r))) !== null && _a !== void 0 ? _a : 0; }); }),
            };
            return {
                ok: true, name: (_e = body === null || body === void 0 ? void 0 : body.name) !== null && _e !== void 0 ? _e : '粘贴文本',
                structured: {
                    domains: domains.length ? domains : ['（未识别到显式模块标记——按整段文本处理）'],
                    roles: roles.length ? roles : ['（未识别到角色行）'],
                    ruleCount: rules.length, criteriaCount: criteria.length,
                    stateMachine: stateLine !== null && stateLine !== void 0 ? stateLine : '（未识别）',
                    rules: rules,
                    criteria: criteria,
                },
                matrix: matrix,
                note: '启发式拆分（关键词/行首标记 + 顺序归属功能域）；.docx 二进制解析属 MarkItDown 集成后续，LLM 深度拆分为增强项',
            };
        };
        // ---------- F3-ignore：忽略清单持久化（cross-check 过滤，重启不丢） ----------
        ImportsController_1.prototype.ignoreFinding = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var fp;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            fp = ((_b = (_a = body === null || body === void 0 ? void 0 : body.fingerprint) !== null && _a !== void 0 ? _a : body === null || body === void 0 ? void 0 : body.title) !== null && _b !== void 0 ? _b : '').trim();
                            // 必填缺失 → 400（body 保持 {ok:false,reason} 兼容前端特判）
                            if (!fp)
                                throw new HttpException({ ok: false, reason: '缺少 fingerprint' }, HttpStatus.BAD_REQUEST);
                            return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _d.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("INSERT INTO import_ignore(fingerprint, title) VALUES ($1, $2) ON CONFLICT (fingerprint) DO NOTHING", [fp, (_c = body === null || body === void 0 ? void 0 : body.title) !== null && _c !== void 0 ? _c : fp])];
                        case 2:
                            _d.sent();
                            return [2 /*return*/, { ok: true }];
                    }
                });
            });
        };
        ImportsController_1.prototype.listIgnores = function () {
            return __awaiter(this, void 0, void 0, function () {
                var r;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT fingerprint, title, created_at FROM import_ignore ORDER BY id DESC LIMIT 100")];
                        case 2:
                            r = _a.sent();
                            return [2 /*return*/, { ok: true, items: r.rows }];
                    }
                });
            });
        };
        ImportsController_1.prototype.crossCheck = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var rules, ignoredRows, ignored, nodes, qas, nodeList, graphText, qaText, keywords, findings, rulesText, _loop_2, _i, rules_1, r, _loop_3, _a, keywords_1, kw, llmUsed, llmError, prompt_1, raw, m, cases, _b, _c, c, e_1, visible;
                var _d, _e, _f, _g, _h;
                return __generator(this, function (_j) {
                    switch (_j.label) {
                        case 0: return [4 /*yield*/, this.exploreSvc.ensureReady()];
                        case 1:
                            _j.sent();
                            rules = (_d = body === null || body === void 0 ? void 0 : body.rules) !== null && _d !== void 0 ? _d : [];
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT fingerprint FROM import_ignore")];
                        case 2:
                            ignoredRows = _j.sent();
                            ignored = new Set(ignoredRows.rows.map(function (r) { return r.fingerprint; }));
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT ref, title FROM graph_node WHERE application_id = 1 AND type = 'page'")];
                        case 3:
                            nodes = _j.sent();
                            return [4 /*yield*/, this.exploreSvc.pg.query("SELECT title FROM qa_point")];
                        case 4:
                            qas = _j.sent();
                            nodeList = nodes.rows;
                            graphText = nodeList.map(function (n) { var _a; return "".concat((_a = n.title) !== null && _a !== void 0 ? _a : '', " ").concat(n.ref); }).join('\n');
                            qaText = qas.rows.map(function (q) { return q.title; }).join('\n');
                            keywords = ['删除', '导出', '导入', '批量', '审核', '驳回', '导出 Excel', '修改密码'];
                            findings = [];
                            rulesText = rules.join('\n');
                            _loop_2 = function (r) {
                                var kw = keywords.find(function (k) { return r.includes(k); });
                                if (!kw)
                                    return "continue";
                                var inGraph = graphText.includes(kw);
                                var inQa = qaText.includes(kw);
                                if (!inGraph && !inQa)
                                    findings.push({ level: 'amber', title: 'Specification Gap · 需求有 · 系统未见', detail: "\u9700\u6C42\u89C4\u5219\u300C".concat(r.slice(0, 60), "\u300D\u6D89\u53CA\u300C").concat(kw, "\u300D\u2014\u2014\u63A2\u7D22\u56FE\u4E0E QA \u70B9\u5E93\u5747\u672A\u8986\u76D6\uFF08\u53EF\u80FD\u672A\u63A2\u7D22\u5230\u6216\u786E\u5C5E\u7F3A\u53E3\uFF09\u3002"), fp: "Specification Gap::".concat(kw) });
                                else if (!inQa)
                                    findings.push({ level: 'yellow', title: 'Undocumented · 图有 · QA 点缺', detail: "\u300C".concat(kw, "\u300D\u5728\u7CFB\u7EDF\u56FE\u4E2D\u5B58\u5728\u4F46\u65E0\u5BF9\u5E94 QA \u70B9\u2014\u2014\u5EFA\u8BAE\u8865\u5145\u9A8C\u8BC1\u300C").concat(r.slice(0, 40), "\u300D\u3002"), fp: "Undocumented::".concat(kw) });
                            };
                            for (_i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
                                r = rules_1[_i];
                                _loop_2(r);
                            }
                            _loop_3 = function (kw) {
                                if (!graphText.includes(kw) || rulesText.includes(kw))
                                    return "continue";
                                var hit = nodeList.find(function (n) { var _a; return "".concat((_a = n.title) !== null && _a !== void 0 ? _a : '', " ").concat(n.ref).includes(kw); });
                                findings.push({ level: 'yellow', title: 'Undocumented Behavior · 原型有 · 需求无', detail: "\u63A2\u7D22\u56FE\u8282\u70B9\u300C".concat((_f = (_e = hit === null || hit === void 0 ? void 0 : hit.title) !== null && _e !== void 0 ? _e : hit === null || hit === void 0 ? void 0 : hit.ref) !== null && _f !== void 0 ? _f : kw, "\u300D\uFF08").concat((_g = hit === null || hit === void 0 ? void 0 : hit.ref) !== null && _g !== void 0 ? _g : '—', "\uFF09\u627F\u8F7D\u300C").concat(kw, "\u300D\u80FD\u529B\uFF0C\u4F46\u9700\u6C42\u89C4\u5219\u6587\u672C\u5747\u672A\u63D0\u53CA\u2014\u2014\u5B9E\u73B0\u8D85\u51FA\u9700\u6C42\u58F0\u660E\uFF0C\u5EFA\u8BAE\u4E0E\u4EA7\u54C1\u5BF9\u9F50\uFF08\u662F\u9690\u542B\u7EA6\u5B9A\u8FD8\u662F\u8FC7\u5EA6\u5B9E\u73B0\uFF09\u3002"), fp: "Undocumented Behavior::".concat(kw) });
                            };
                            // G16 档 4：Undocumented Behavior（图有 · 需求无）——原型承载了能力但需求只字未提
                            for (_a = 0, keywords_1 = keywords; _a < keywords_1.length; _a++) {
                                kw = keywords_1[_a];
                                _loop_3(kw);
                            }
                            llmUsed = false;
                            llmError = '';
                            if (!((body === null || body === void 0 ? void 0 : body.useLLM) && rules.length > 0)) return [3 /*break*/, 8];
                            _j.label = 5;
                        case 5:
                            _j.trys.push([5, 7, , 8]);
                            prompt_1 = "\u4F60\u662F\u8D44\u6DF1\u6D4B\u8BD5\u8BBE\u8BA1\u5E08\u3002\u4EE5\u4E0B\u662F\u67D0\u4EA7\u54C1\u7684\u9700\u6C42\u4E1A\u52A1\u89C4\u5219\u5217\u8868\uFF1A\n".concat(rules.map(function (r, i) { return "".concat(i + 1, ". ").concat(r); }).join('\n'), "\n\n\u8BF7\u63A8\u5BFC 1-3 \u6761\u89C4\u5219\u672A\u8986\u76D6\u7684\u8FB9\u754C\u7528\u4F8B\uFF08\u4F8B\u5982\u7A7A\u8F93\u5165\u3001\u5E76\u53D1\u3001\u6781\u7AEF\u6570\u91CF\u3001\u6743\u9650\u4EA4\u53C9\u7B49\uFF09\uFF0C\u4E25\u683C\u8F93\u51FA JSON \u6570\u7EC4\uFF08\u4E0D\u8981\u591A\u4F59\u6587\u5B57\uFF09\uFF1A[{\"title\":\"\u7528\u4F8B\u540D\uFF0810\u5B57\u5185\uFF09\",\"rationale\":\"\u4E3A\u4EC0\u4E48\u8FD9\u662F\u89C4\u5219\u672A\u8986\u76D6\u7684\u8FB9\u754C\uFF0840\u5B57\u5185\uFF09\"}]");
                            return [4 /*yield*/, this.llm.chat([{ role: 'user', content: prompt_1 }])];
                        case 6:
                            raw = _j.sent();
                            m = raw.match(/\[[\s\S]*\]/);
                            cases = m ? JSON.parse(m[0]) : [];
                            for (_b = 0, _c = cases.slice(0, 3); _b < _c.length; _b++) {
                                c = _c[_b];
                                if (!(c === null || c === void 0 ? void 0 : c.title))
                                    continue;
                                findings.push({ level: 'amber', title: "\u7F3A\u5931\u9700\u6C42\u63A8\u5BFC \u00B7 AI Test Design \u00B7 ".concat(c.title), detail: "LLM \u4ECE\u73B0\u6709 ".concat(rules.length, " \u6761\u89C4\u5219\u63A8\u5BFC\u51FA\u672A\u8986\u76D6\u8FB9\u754C\u7528\u4F8B\u300C").concat(c.title, "\u300D\uFF1A").concat((_h = c.rationale) !== null && _h !== void 0 ? _h : '—', "\uFF08\u9700\u6C42\u6587\u672C\u672A\u58F0\u660E\u8BE5\u8FB9\u754C\u7684\u884C\u4E3A\u2014\u2014\u5EFA\u8BAE\u8865\u89C4\u5219\u6216\u8865 QA \u70B9\uFF09\u3002"), fp: "AI Test Design::".concat(c.title) });
                            }
                            llmUsed = true;
                            return [3 /*break*/, 8];
                        case 7:
                            e_1 = _j.sent();
                            llmError = e_1 instanceof Error ? e_1.message.slice(0, 120) : String(e_1).slice(0, 120);
                            return [3 /*break*/, 8];
                        case 8:
                            visible = findings.filter(function (f) { return !ignored.has(f.fp) && !ignored.has(f.title); });
                            return [2 /*return*/, { ok: true, findings: visible.slice(0, 10), ignoredCount: findings.length - visible.length, llmUsed: llmUsed, llmError: llmError, note: '关键词级启发式匹配 + 图有需求无反查 + 可选 LLM 边界推导；三方语义交叉（需求×原型×运行系统）的深度增强属后续' }];
                    }
                });
            });
        };
        return ImportsController_1;
    }());
    __setFunctionName(_classThis, "ImportsController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _parseImport_decorators = [(0, common_1.Post)('imports/parse')];
        _ignoreFinding_decorators = [(0, common_1.Post)('imports/ignore')];
        _listIgnores_decorators = [(0, common_1.Get)('imports/ignores')];
        _crossCheck_decorators = [(0, common_1.Post)('imports/cross-check')];
        __esDecorate(_classThis, null, _parseImport_decorators, { kind: "method", name: "parseImport", static: false, private: false, access: { has: function (obj) { return "parseImport" in obj; }, get: function (obj) { return obj.parseImport; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _ignoreFinding_decorators, { kind: "method", name: "ignoreFinding", static: false, private: false, access: { has: function (obj) { return "ignoreFinding" in obj; }, get: function (obj) { return obj.ignoreFinding; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _listIgnores_decorators, { kind: "method", name: "listIgnores", static: false, private: false, access: { has: function (obj) { return "listIgnores" in obj; }, get: function (obj) { return obj.listIgnores; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _crossCheck_decorators, { kind: "method", name: "crossCheck", static: false, private: false, access: { has: function (obj) { return "crossCheck" in obj; }, get: function (obj) { return obj.crossCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ImportsController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ImportsController = _classThis;
}();
exports.ImportsController = ImportsController;
