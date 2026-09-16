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
require("reflect-metadata");
var dotenv_1 = require("dotenv");
var core_1 = require("@nestjs/core");
var common_1 = require("@nestjs/common");
var app_module_1 = require("./app.module");
// 依次尝试根目录与包内 .env（dotenv 默认不覆盖已存在变量；生产由容器注入 env）
dotenv_1.default.config({ path: '.env' });
dotenv_1.default.config({ path: '../../.env' });
/**
 * 全局异常过滤器（J01 任务1）：错误响应形状统一为 {"error": <message>}。
 * - HttpException 字符串 body → {"error": msg}；对象 body（{ok:false,reason}）原样透传（前端已特判）
 * - Nest 默认 {statusCode,message} → 归一为 {"error": message}
 * - PG 参数类错误（invalid input syntax / 数值越界，code 22xxx）→ 400（兜底 NaN 防护）
 * - 其余未捕获异常 → 500 {"error": message}，不再裸 {"statusCode":500}
 */
var UnifiedExceptionFilter = function () {
    var _classDecorators = [(0, common_1.Catch)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var UnifiedExceptionFilter = _classThis = /** @class */ (function () {
        function UnifiedExceptionFilter_1() {
        }
        UnifiedExceptionFilter_1.prototype.catch = function (exception, host) {
            var _a;
            var res = host.switchToHttp().getResponse();
            var status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            var body;
            if (exception instanceof common_1.HttpException) {
                status = exception.getStatus();
                var r = exception.getResponse();
                if (typeof r === 'string') {
                    body = { error: r };
                }
                else {
                    var obj = r;
                    if (typeof obj.error === 'string' || typeof obj.ok === 'boolean' || typeof obj.found === 'boolean') {
                        body = obj; // 已带 error / ok:false / found:false 语义，保持兼容
                    }
                    else if (typeof obj.message === 'string') {
                        body = { error: obj.message };
                    }
                    else {
                        body = { error: JSON.stringify(obj) };
                    }
                }
            }
            else {
                var pgCode = (_a = exception === null || exception === void 0 ? void 0 : exception.code) !== null && _a !== void 0 ? _a : '';
                var msg = exception instanceof Error ? exception.message : String(exception);
                if (pgCode.startsWith('22')) {
                    // PG 数据类错误：invalid input syntax for type ... / 数值越界 → 参数问题，400
                    status = common_1.HttpStatus.BAD_REQUEST;
                    body = { error: /invalid input syntax/i.test(msg) ? 'invalid id' : msg };
                }
                else {
                    body = { error: msg };
                }
            }
            res.status(status).json(body);
        };
        return UnifiedExceptionFilter_1;
    }());
    __setFunctionName(_classThis, "UnifiedExceptionFilter");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        UnifiedExceptionFilter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return UnifiedExceptionFilter = _classThis;
}();
function bootstrap() {
    return __awaiter(this, void 0, void 0, function () {
        var app, port;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, core_1.NestFactory.create(app_module_1.AppModule, { cors: true })];
                case 1:
                    app = _a.sent();
                    app.useGlobalFilters(new UnifiedExceptionFilter());
                    port = Number(process.env.API_PORT || 8080);
                    return [4 /*yield*/, app.listen(port)];
                case 2:
                    _a.sent();
                    console.log("[verifyos-server] listening on http://localhost:".concat(port));
                    return [2 /*return*/];
            }
        });
    });
}
bootstrap();
