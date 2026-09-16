"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatIntentSchema = void 0;
exports.parseChatIntent = parseChatIntent;
var zod_1 = require("zod");
var ai_1 = require("ai");
var openai_compatible_1 = require("@ai-sdk/openai-compatible");
exports.ChatIntentSchema = zod_1.z.object({
    action: zod_1.z
        .enum(['explore', 'run_tests', 'show_qa_points', 'show_map', 'chat'])
        .describe('用户想做的动作：explore=探索一个网站生成QA点 / run_tests=跑一次验证 / show_qa_points=查看已有QA点 / show_map=查看应用地图 / chat=闲聊或问能力'),
    target_url: zod_1.z.string().optional().describe('用户提到的目标网站 URL（如有）'),
    intent_text: zod_1.z.string().optional().describe('提炼后的业务意图/测试重点'),
    reply: zod_1.z.string().describe('给用户的中文回复（说明你要做什么，友好专业，≤120字）'),
});
var SYSTEM_CONTEXT = "\u4F60\u662F VerifyOS\uFF08\u4E2D\u6587 AI \u6D4B\u8BD5\u5E73\u53F0\uFF09\u7684 AI \u52A9\u624B\u3002\u5E73\u53F0\u80FD\u529B\uFF1A\n1. explore\uFF1A\u5BF9\u4E00\u4E2A\u7F51\u7AD9\u505A AI \u63A2\u7D22\uFF08\u722C\u53D6\u2192\u81EA\u52A8\u767B\u5F55\u2192\u751F\u6210 Coverage Graph\u2192LLM \u63D0\u53D6 QA \u70B9\u5019\u9009\uFF09\n2. run_tests\uFF1A\u5BF9\u5DF2\u63A2\u7D22\u7684\u5E94\u7528\u8DD1\u4E00\u6B21\u9A8C\u8BC1\uFF08\u771F\u6D4F\u89C8\u5668\u6267\u884C + \u622A\u56FE/\u7F51\u7EDC\u8BC1\u636E + UNKNOWN \u9632\u5047\u7EFF\uFF09\n3. show_qa_points\uFF1A\u67E5\u770B\u5DF2\u751F\u6210\u7684 QA \u70B9\u5E93\n4. show_map\uFF1A\u67E5\u770B\u5E94\u7528\u5730\u56FE\uFF08\u9875\u9762\u8986\u76D6\u56FE\uFF09\n\u5F53\u524D\u6F14\u793A\u7AD9\u70B9\u7531\u7CFB\u7EDF\u63D0\u4F9B\uFF08\u672C\u5730\u6F14\u793A CRM\uFF1A\u767B\u5F55\u5899\u2192\u5458\u5DE5\u5217\u8868\u2192\u8BE6\u60C5\uFF0C\u8D26\u53F7 admin/test123\uFF1B\u7528\u6237\u672A\u660E\u786E\u6307\u5B9A\u5916\u90E8 URL \u65F6\u7531\u7CFB\u7EDF\u6CE8\u5165\u6B63\u786E\u5165\u53E3\uFF0C\u4F60\u4E0D\u8981\u5728 target_url \u91CC\u7F16\u9020\u7AEF\u53E3\uFF09\u3002\n\u7528\u6237\u8BF4\"\u5E2E\u6211\u6D4B XX\"/\"\u63A2\u7D22 XX\"\u2192explore\uFF1B\"\u8DD1\u4E00\u4E0B\u9A8C\u8BC1\"/\"\u6267\u884C\u6D4B\u8BD5\"\u2192run_tests\uFF1B\"\u770B\u770B QA \u70B9\"/\"\u6709\u4EC0\u4E48\u6D4B\u8BD5\u5EFA\u8BAE\"\u2192show_qa_points\uFF1B\"\u5E94\u7528\u5730\u56FE\"/\"\u8986\u76D6\u60C5\u51B5\"\u2192show_map\uFF1B\n\u95EE\u5019/\u95EE\u4F60\u80FD\u5E72\u4EC0\u4E48\u2192chat\uFF08reply \u91CC\u4ECB\u7ECD\u80FD\u529B\u5E76\u5F15\u5BFC\uFF09\u3002\u7528\u6237\u7ED9\u4E86 URL \u6216\u8BF4\"\u8FD9\u4E2A\u7AD9\"\u2192\u63D0\u53D6 URL \u5230 target_url\u3002";
/** 解析用户自然语言 → 结构化动作计划（LLM structured output） */
function parseChatIntent(message, llm) {
    return __awaiter(this, void 0, void 0, function () {
        var provider, object;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    provider = (0, openai_compatible_1.createOpenAICompatible)({ name: 'glm', apiKey: llm.apiKey, baseURL: llm.baseURL });
                    return [4 /*yield*/, (0, ai_1.generateObject)({
                            model: provider(llm.model),
                            schema: exports.ChatIntentSchema,
                            prompt: "".concat(SYSTEM_CONTEXT, "\n\n\u7528\u6237\u8BF4\uFF1A\u300C").concat(message, "\u300D\n\u8BF7\u89E3\u6790\u4E3A\u52A8\u4F5C\u8BA1\u5212\u3002"),
                        })];
                case 1:
                    object = (_a.sent()).object;
                    return [2 /*return*/, object];
            }
        });
    });
}
