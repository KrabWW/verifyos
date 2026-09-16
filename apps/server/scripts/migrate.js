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
exports.runMigrations = runMigrations;
/**
 * 迁移运行器（B1）：按文件名顺序应用 migrations/*.sql，_migrations 表去重，可重复执行。
 * 用法（真实 PG）：DATABASE_URL=... pnpm --filter @verifyos/server migrate
 * 冒烟测试（pg-mem）：pnpm --filter @verifyos/server db:smoke
 */
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var node_url_1 = require("node:url");
var pg_1 = require("pg");
var __dirname = node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url));
var MIGRATIONS_DIR = node_path_1.default.resolve(__dirname, '../migrations');
function runMigrations(client_1) {
    return __awaiter(this, arguments, void 0, function (client, opts) {
        var files, hasMig, _i, files_1, f, done, sql, e_1;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    files = node_fs_1.default.readdirSync(MIGRATIONS_DIR).filter(function (f) { return f.endsWith('.sql'); }).sort();
                    if (files.length === 0)
                        throw new Error('no migration files');
                    return [4 /*yield*/, client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='_migrations'")];
                case 1:
                    hasMig = (_a.sent());
                    if (!(hasMig.rows[0].n === 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, client.query('CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i = 0, files_1 = files;
                    _a.label = 4;
                case 4:
                    if (!(_i < files_1.length)) return [3 /*break*/, 14];
                    f = files_1[_i];
                    return [4 /*yield*/, client.query('SELECT 1 FROM _migrations WHERE name=$1', [f])];
                case 5:
                    done = _a.sent();
                    if (done.rows.length > 0) {
                        console.log("  \u00B7 skip ".concat(f, "\uFF08\u5DF2\u5E94\u7528\uFF09"));
                        return [3 /*break*/, 13];
                    }
                    sql = node_fs_1.default.readFileSync(node_path_1.default.join(MIGRATIONS_DIR, f), 'utf8');
                    if (opts.transform)
                        sql = opts.transform(sql, f);
                    return [4 /*yield*/, client.query('BEGIN')];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 11, , 13]);
                    return [4 /*yield*/, client.query(sql)];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, client.query('INSERT INTO _migrations(name) VALUES($1)', [f])];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, client.query('COMMIT')];
                case 10:
                    _a.sent();
                    console.log("  \u2713 applied ".concat(f));
                    return [3 /*break*/, 13];
                case 11:
                    e_1 = _a.sent();
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 12:
                    _a.sent();
                    throw e_1;
                case 13:
                    _i++;
                    return [3 /*break*/, 4];
                case 14: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var url, pool, t;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = process.env.DATABASE_URL || 'postgresql://verifyos:verifyos@localhost:5432/verifyos';
                    pool = new pg_1.default.Pool({ connectionString: url });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 4, 6]);
                    console.log("[migrate] ".concat(url.replace(/:[^:@]+@/, '://***@')));
                    return [4 /*yield*/, runMigrations(pool)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")];
                case 3:
                    t = _a.sent();
                    console.log("[migrate] done \u00B7 public \u8868 ".concat(t.rows[0].n, " \u5F20"));
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, pool.end()];
                case 5:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
var isMain = process.argv[1] && process.argv[1].endsWith('migrate.ts');
if (isMain)
    main().catch(function (e) { console.error('[migrate] failed:', e.message); process.exit(1); });
