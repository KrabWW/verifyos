import { Keyboard, MousePointerClick, Globe, Plus, X } from 'lucide-react';

/**
 * U25：共享步骤编辑表单——验证编辑器与验证·执行页左列共用同一组件。
 * 单一事实来源，杜绝再长出「字段残缺的劣化拷贝」（U24 教训）。
 * module=确定性动作序列（goto/fill/click 行编辑）· ai=LLM 指令 · assertion=三选断言 + targetRef 防假绿。
 */

export interface EditorAction { type: 'goto' | 'fill' | 'click'; selector?: string; value?: string; url?: string }
export type AssertKind = 'url_contains' | 'text_visible' | 'element_visible';
export interface EditableStep {
  id: string;
  title: string;
  kind: 'module' | 'ai' | 'assertion' | 'deterministic';
  actions?: EditorAction[];
  instruction?: string;
  assert?: { kind: AssertKind; value: string };
  /** 执行页历史形态：assert 的快捷值（url_contains 语义）——与 assert 二选一 */
  assertValue?: string;
  targetRef?: string;
}

export function StepEditor({ step, onChange }: {
  step: EditableStep;
  onChange: (patch: Partial<EditableStep>) => void;
}) {
  const acts = step.actions ?? [];
  const patchAction = (i: number, p: Partial<EditorAction>) => {
    const next = [...acts];
    next[i] = { ...next[i], ...p };
    onChange({ actions: next });
  };
  const addAction = () => onChange({ actions: [...acts, { type: 'click', selector: '' }] });
  const delAction = (i: number) => onChange({ actions: acts.filter((_, k) => k !== i) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div className="editrow"><label>标题</label><input className="inp" value={step.title} onChange={(e) => onChange({ title: e.target.value })} /></div>

      {step.kind === 'module' && (
        <div>
          {acts.map((a, i) => (
            <div key={i} className="actrow">
              <select value={a.type} onChange={(e) => patchAction(i, { type: e.target.value as EditorAction['type'] })} style={{ width: 74 }}>
                <option value="goto">goto</option><option value="fill">fill</option><option value="click">click</option>
              </select>
              {a.type === 'goto'
                ? <input placeholder="https://…" value={a.url ?? ''} onChange={(e) => patchAction(i, { url: e.target.value })} style={{ flex: 1 }} />
                : <input placeholder="selector，如 #username" value={a.selector ?? ''} onChange={(e) => patchAction(i, { selector: e.target.value })} style={{ flex: 1 }} />}
              {a.type === 'fill' && (
                <input placeholder="值" type={/password|secret/i.test(a.selector ?? '') ? 'password' : 'text'} value={a.value ?? ''} onChange={(e) => patchAction(i, { value: e.target.value })} style={{ width: 76 }} />
              )}
              <button className="iconbtn" title="删除动作" onClick={() => delAction(i)}><X size={10} /></button>
            </div>
          ))}
          <button className="iconbtn" title="添加确定性动作" onClick={addAction} style={{ marginTop: 3 }}><Plus size={10} /> 动作</button>
        </div>
      )}

      {step.kind === 'ai' && (
        <div className="editrow">
          <label><Keyboard size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />指令</label>
          <input className="inp" value={step.instruction ?? ''} onChange={(e) => onChange({ instruction: e.target.value })} placeholder="自然语言指令，如：点击第一行的「编辑」" />
        </div>
      )}

      {step.kind === 'assertion' && (
        <div className="actrow" style={{ flexWrap: 'wrap' }}>
          <select value={step.assert?.kind ?? 'url_contains'} onChange={(e) => onChange({ assert: { kind: e.target.value as AssertKind, value: step.assert?.value ?? '' } })} style={{ maxWidth: 118 }}>
            <option value="url_contains">url_contains</option>
            <option value="text_visible">text_visible</option>
            <option value="element_visible">element_visible</option>
          </select>
          <input
            placeholder="断言值（URL 片段 / 文本 / 选择器）"
            value={step.assert?.value ?? step.assertValue ?? ''}
            onChange={(e) => onChange({ assert: { kind: step.assert?.kind ?? 'url_contains', value: e.target.value } })}
            style={{ flex: 1, minWidth: 90 }}
          />
        </div>
      )}

      <div className="editrow">
        <label><Globe size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />目标分支</label>
        <input className="inp mono" value={step.targetRef ?? ''} onChange={(e) => onChange({ targetRef: e.target.value || undefined })} placeholder="targetRef（防假绿）" />
      </div>
      {step.kind === 'module' && acts.length === 0 && (
        <p className="dim" style={{ fontSize: 10, margin: 0 }}>module 步骤还没有动作——点「＋ 动作」添加 goto / fill / click</p>
      )}
      {step.kind === 'deterministic' && <p className="hint" style={{ margin: 0 }}>确定性脚本步骤：由引擎内置执行，无可视编辑。</p>}
      {step.kind !== 'module' && step.kind !== 'deterministic' && step.kind !== 'ai' && step.kind !== 'assertion' && null}
      {/* click 提示：MousePointerClick 语义保留给 Action Log，这里不再重复图标 */}
      {false && <MousePointerClick size={10} />}
    </div>
  );
}
