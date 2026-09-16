/**
 * 场景表达式安全求值器（P1.6 条件步骤 / while 循环用）。
 *
 * 不用 eval：手写「分词 + 递归下降解析」，只开放受控语法：
 * - 字面量：数字 / 单双引号字符串 / true / false / null；
 * - 变量：裸变量名（如 balance >= price）或 {{var}} 占位两种写法；
 *   标识符可含点（dataset.staff.username 命名空间变量）；
 *   未定义变量按 null 参与求值（可用 "x == null" 判断变量是否存在/出作用域）；
 * - 运算：比较（> >= < <= == !=，=== / !== 等同 == / !=）、
 *   逻辑（&& || !）、算术（+ - * / % 与一元负号）、括号分组。
 *
 * 数值语义：两侧都能转数字时按数字比较/运算，否则按字符串比较；
 * 加法遇到两侧均为非数字字符串时退化为字符串拼接（数字字符串仍按数字相加）。
 *
 * 诚实范围：不支持属性访问 / 函数调用 / 三元表达式，这是条件分支与
 * while 循环所需的最小集；对标 MeterSphere 的 JS 脚本节点属后续里程碑。
 */
import { renderTemplate } from './template.js';

/** 表达式值的运行时类型（变量均为字符串，字面量可为此处各类型） */
export type ExprValue = number | string | boolean | null;

/** 记号：数字 / 字符串 / 标识符 / 操作符 */
interface Token {
  kind: 'num' | 'str' | 'ident' | 'op';
  text: string;
  value?: ExprValue;
}

/** 多字符操作符（=== / !== 归一化为 == / !=，语义见文件头说明） */
const MULTI_CHAR_OPS: readonly string[] = ['>=', '<=', '==', '!=', '===', '!==', '&&', '||'];
/** 单字符操作符 */
const SINGLE_CHAR_OPS = '><!()+-*/%';
/** 比较操作符集合 */
const COMPARISON_OPS: readonly string[] = ['>', '<', '>=', '<=', '==', '!='];

/** 分词：空白跳过；数字 / 字符串 / 标识符 / 操作符 */
function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // 数字（含小数；以 . 开头且后跟数字也视为数字）
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src.charAt(j))) j++;
      const text = src.slice(i, j);
      const num = Number(text);
      if (Number.isNaN(num)) throw new Error(`表达式数字非法：${text}`);
      tokens.push({ kind: 'num', text, value: num });
      i = j;
      continue;
    }
    // 字符串（单双引号，支持 \\ \' \" \n \t 转义）
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      let out = '';
      while (j < src.length && src.charAt(j) !== ch) {
        const c = src.charAt(j);
        if (c === '\\' && j + 1 < src.length) {
          const n = src.charAt(j + 1);
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else {
          out += c;
          j++;
        }
      }
      if (j >= src.length) throw new Error('表达式字符串未闭合');
      tokens.push({ kind: 'str', text: src.slice(i, j + 1), value: out });
      i = j + 1;
      continue;
    }
    // 标识符（可含点，兼容 dataset.staff.username 命名空间变量名）
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src.charAt(j))) j++;
      tokens.push({ kind: 'ident', text: src.slice(i, j) });
      i = j;
      continue;
    }
    // 多字符操作符优先
    const two = src.slice(i, i + 2);
    if (MULTI_CHAR_OPS.includes(two)) {
      const op = two === '===' ? '==' : two === '!==' ? '!=' : two;
      tokens.push({ kind: 'op', text: op });
      i += 2;
      continue;
    }
    if (SINGLE_CHAR_OPS.includes(ch)) {
      tokens.push({ kind: 'op', text: ch });
      i++;
      continue;
    }
    throw new Error(`表达式含非法字符：${ch}`);
  }
  return tokens;
}

/** 真值判定：false / null / 0 / 空串 / NaN 为假，其余为真 */
function isTruthy(v: ExprValue): boolean {
  if (v === null || v === false) return false;
  if (v === 0 || v === '') return false;
  if (typeof v === 'number' && Number.isNaN(v)) return false;
  return true;
}

/** 转数字：非空数字字符串可转，布尔按 0/1，其余不可转返回 undefined */
function toNumber(v: ExprValue): number | undefined {
  if (typeof v === 'number') return Number.isNaN(v) ? undefined : v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

/** 两侧均可转数字时返回数值对，否则 undefined */
function bothNumeric(a: ExprValue, b: ExprValue): [number, number] | undefined {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === undefined || nb === undefined) return undefined;
  return [na, nb];
}

/** 值转人读字符串（null 显式为 'null'） */
function textOf(v: ExprValue): string {
  if (v === null) return 'null';
  return String(v);
}

/** 比较运算：数值优先，非数值按字符串比较 */
function compareValues(op: string, a: ExprValue, b: ExprValue): boolean {
  const nums = bothNumeric(a, b);
  switch (op) {
    case '==':
      return nums ? nums[0] === nums[1] : textOf(a) === textOf(b);
    case '!=':
      return nums ? nums[0] !== nums[1] : textOf(a) !== textOf(b);
    case '>':
      return nums ? nums[0] > nums[1] : textOf(a) > textOf(b);
    case '<':
      return nums ? nums[0] < nums[1] : textOf(a) < textOf(b);
    case '>=':
      return nums ? nums[0] >= nums[1] : textOf(a) >= textOf(b);
    case '<=':
      return nums ? nums[0] <= nums[1] : textOf(a) <= textOf(b);
    default:
      throw new Error(`不支持的比较操作符：${op}`);
  }
}

/** 算术运算：要求两侧可转数字；加法对「双非数字字符串」退化为拼接 */
function arithmetic(op: string, a: ExprValue, b: ExprValue): ExprValue {
  if (op === '+' && typeof a === 'string' && typeof b === 'string' && bothNumeric(a, b) === undefined) {
    return a + b;
  }
  const nums = bothNumeric(a, b);
  if (nums === undefined) {
    throw new Error(`算术运算 ${op} 要求操作数为数字（实际 ${textOf(a)} / ${textOf(b)}）`);
  }
  const [x, y] = nums;
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      return x / y;
    case '%':
      return x % y;
    default:
      throw new Error(`不支持的算术操作符：${op}`);
  }
}

/** 递归下降解析器（优先级：|| < && < ! < 比较 < 加减 < 乘除模 < 一元负号/原子） */
class ExprParser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly vars: Record<string, string>,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private eatOp(op: string): boolean {
    const t = this.peek();
    if (t !== undefined && t.kind === 'op' && t.text === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expectOp(op: string): void {
    if (!this.eatOp(op)) throw new Error(`表达式缺少 ${op}`);
  }

  parse(): ExprValue {
    const value = this.parseOr();
    if (this.pos < this.tokens.length) throw new Error('表达式存在无法解析的多余部分');
    return value;
  }

  private parseOr(): ExprValue {
    let left = this.parseAnd();
    while (this.eatOp('||')) {
      left = isTruthy(left) || isTruthy(this.parseAnd());
    }
    return left;
  }

  private parseAnd(): ExprValue {
    let left = this.parseUnary();
    while (this.eatOp('&&')) {
      left = isTruthy(left) && isTruthy(this.parseUnary());
    }
    return left;
  }

  private parseUnary(): ExprValue {
    if (this.eatOp('!')) return !isTruthy(this.parseUnary());
    return this.parseComparison();
  }

  private parseComparison(): ExprValue {
    const left = this.parseAdditive();
    const t = this.peek();
    if (t !== undefined && t.kind === 'op' && COMPARISON_OPS.includes(t.text)) {
      this.pos++;
      const right = this.parseAdditive();
      return compareValues(t.text, left, right);
    }
    return left;
  }

  private parseAdditive(): ExprValue {
    let left = this.parseMultiplicative();
    for (;;) {
      if (this.eatOp('+')) left = arithmetic('+', left, this.parseMultiplicative());
      else if (this.eatOp('-')) left = arithmetic('-', left, this.parseMultiplicative());
      else return left;
    }
  }

  private parseMultiplicative(): ExprValue {
    let left = this.parsePrimary();
    for (;;) {
      if (this.eatOp('*')) left = arithmetic('*', left, this.parsePrimary());
      else if (this.eatOp('/')) left = arithmetic('/', left, this.parsePrimary());
      else if (this.eatOp('%')) left = arithmetic('%', left, this.parsePrimary());
      else return left;
    }
  }

  private parsePrimary(): ExprValue {
    const t = this.next();
    if (t === undefined) throw new Error('表达式意外结束');
    if (t.kind === 'num') return t.value as number;
    if (t.kind === 'str') return t.value as string;
    if (t.kind === 'ident') {
      if (t.text === 'true') return true;
      if (t.text === 'false') return false;
      if (t.text === 'null') return null;
      const raw = this.vars[t.text];
      return raw === undefined ? null : raw;
    }
    if (t.text === '(') {
      const value = this.parseOr();
      this.expectOp(')');
      return value;
    }
    if (t.text === '-') {
      const v = this.parsePrimary();
      const n = toNumber(v);
      if (n === undefined) throw new Error('一元负号只能用于数字');
      return -n;
    }
    throw new Error(`表达式记号非法：${t.text}`);
  }
}

/**
 * 求值表达式，返回布尔结果（按 isTruthy 规则归一）。
 * 抛错场景（非法字符 / 语法错误 / 算术类型不符等）由调用方捕获后标记步骤失败。
 */
export function evaluateExpression(expr: string, vars: Record<string, string>): boolean {
  if (expr.trim() === '') throw new Error('表达式为空');
  // 先渲染 {{var}} 占位，再解析（兼容两种变量写法）
  const rendered = renderTemplate(expr, vars);
  const parser = new ExprParser(tokenize(rendered), vars);
  return isTruthy(parser.parse());
}
