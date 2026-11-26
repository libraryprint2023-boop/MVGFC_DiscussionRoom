import { useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { GUIDELINE_CATEGORIES } from '../../lib/enterpriseRules';
import type { GuidelineCategory, LibraryGuideline, LibraryRule } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface AdminContentSectionProps {
  rules: LibraryRule[];
  guidelines: LibraryGuideline[];
  onCreateRule: (payload: { title: string; content: string; published: boolean }) => Promise<void>;
  onUpdateRule: (id: string, payload: Partial<Pick<LibraryRule, 'title' | 'content' | 'published'>>) => Promise<void>;
  onReorderRules: (orderedIds: string[]) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onCreateGuideline: (payload: {
    title: string;
    category: GuidelineCategory;
    description: string;
    instructions: string[];
    published: boolean;
  }) => Promise<void>;
  onUpdateGuideline: (
    id: string,
    payload: Partial<Pick<LibraryGuideline, 'title' | 'category' | 'description' | 'instructions' | 'published'>>
  ) => Promise<void>;
  onReorderGuidelines: (orderedIds: string[]) => Promise<void>;
  onDeleteGuideline: (id: string) => Promise<void>;
}

export function AdminContentSection({
  rules,
  guidelines,
  onCreateRule,
  onUpdateRule,
  onReorderRules,
  onDeleteRule,
  onCreateGuideline,
  onUpdateGuideline,
  onReorderGuidelines,
  onDeleteGuideline,
}: AdminContentSectionProps) {
  const [activeTab, setActiveTab] = useState<'rules' | 'guidelines'>('rules');
  const [previewPublic, setPreviewPublic] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rule editor state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleContent, setRuleContent] = useState('');
  const [rulePublished, setRulePublished] = useState(true);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<LibraryRule | null>(null);

  // Guideline editor state
  const [editingGuidelineId, setEditingGuidelineId] = useState<string | null>(null);
  const [gdlTitle, setGdlTitle] = useState('');
  const [gdlCategory, setGdlCategory] = useState<GuidelineCategory>('Eligibility');
  const [gdlDescription, setGdlDescription] = useState('');
  const [gdlInstructionsText, setGdlInstructionsText] = useState('');
  const [gdlPublished, setGdlPublished] = useState(true);
  const [confirmDeleteGuideline, setConfirmDeleteGuideline] = useState<LibraryGuideline | null>(null);

  const sortedRules = [...rules].sort((a, b) => a.order - b.order);
  const sortedGuidelines = [...guidelines].sort((a, b) => a.order - b.order);

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleTitle('');
    setRuleContent('');
    setRulePublished(true);
  };

  const resetGuidelineForm = () => {
    setEditingGuidelineId(null);
    setGdlTitle('');
    setGdlCategory('Eligibility');
    setGdlDescription('');
    setGdlInstructionsText('');
    setGdlPublished(true);
  };

  const handleSaveRule = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (editingRuleId) {
        await onUpdateRule(editingRuleId, {
          title: ruleTitle,
          content: ruleContent,
          published: rulePublished,
        });
        setNotice(`Updated rule "${ruleTitle}".`);
      } else {
        await onCreateRule({
          title: ruleTitle,
          content: ruleContent,
          published: rulePublished,
        });
        setNotice(`Added new rule "${ruleTitle}".`);
      }
      resetRuleForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save rule.');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveRule = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= sortedRules.length) return;
    const ids = sortedRules.map((r) => r.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    await onReorderRules(ids);
    setNotice('Updated rule display order.');
  };

  const handleSaveGuideline = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const instructions = gdlInstructionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      if (editingGuidelineId) {
        await onUpdateGuideline(editingGuidelineId, {
          title: gdlTitle,
          category: gdlCategory,
          description: gdlDescription,
          instructions,
          published: gdlPublished,
        });
        setNotice(`Updated guideline "${gdlTitle}".`);
      } else {
        await onCreateGuideline({
          title: gdlTitle,
          category: gdlCategory,
          description: gdlDescription,
          instructions,
          published: gdlPublished,
        });
        setNotice(`Added new guideline "${gdlTitle}".`);
      }
      resetGuidelineForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save guideline.');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveGuideline = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= sortedGuidelines.length) return;
    const ids = sortedGuidelines.map((g) => g.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    await onReorderGuidelines(ids);
    setNotice('Updated guideline display order.');
  };

  return (
    <div data-tour="content-management" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Rules, Regulations &amp; Guidelines Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Create, reorder, preview, publish, or unpublish library discussion room policies reflected on the public portal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'rules' ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <ScrollText className="h-3.5 w-3.5" />
              <span>Rules ({sortedRules.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guidelines')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'guidelines' ? 'bg-[#144A34] text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <BookOpenCheck className="h-3.5 w-3.5" />
              <span>Guidelines ({sortedGuidelines.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPreviewPublic((p) => !p)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap ${
              previewPublic
                ? 'border-[#144A34] bg-[#144A34]/10 text-[#144A34]'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {previewPublic ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{previewPublic ? 'Hide Public Preview' : 'Preview Public View'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      {previewPublic && (
        <section className="rounded-xl border border-[#144A34]/30 bg-white p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-[11px] font-semibold text-[#144A34] uppercase tracking-wide">
              Public Guidelines Page Preview (Published Items Only)
            </div>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {activeTab === 'rules' ? 'Official Rules & Regulations' : 'Categorized Operating Guidelines'}
            </h2>
          </div>

          {activeTab === 'rules' ? (
            <ol className="space-y-3">
              {sortedRules.filter((r) => r.published).map((rule, idx) => (
                <li key={rule.id} className="flex items-start gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#144A34]/10 font-mono text-xs font-semibold text-[#144A34] tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900">{rule.title}</div>
                    <p className="text-slate-600">{rule.content}</p>
                  </div>
                </li>
              ))}
              {sortedRules.filter((r) => r.published).length === 0 && (
                <p className="text-xs text-slate-500">No rules are currently published.</p>
              )}
            </ol>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sortedGuidelines.filter((g) => g.published).map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-[#F7F9F8] p-4">
                  <div className="text-[11px] font-semibold text-[#144A34] uppercase">{item.category}</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{item.title}</div>
                  <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {item.instructions.map((line, i) => (
                      <li key={i}>• {line}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {sortedGuidelines.filter((g) => g.published).length === 0 && (
                <p className="text-xs text-slate-500">No guidelines are currently published.</p>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'rules' ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Create / Edit Rule Form */}
          <form onSubmit={handleSaveRule} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5 self-start">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingRuleId ? 'Edit Rule' : 'Add New Rule'}
            </h2>
            <div>
              <label htmlFor="rule-title" className="mb-1 block text-xs font-medium text-slate-700">
                Rule Title <span className="text-rose-600">*</span>
              </label>
              <input
                id="rule-title"
                type="text"
                required
                minLength={3}
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                placeholder="e.g. Room Capacity & Quiet Study Etiquette"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rule-content" className="mb-1 block text-xs font-medium text-slate-700">
                Rule Details <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="rule-content"
                rows={4}
                required
                minLength={10}
                value={ruleContent}
                onChange={(e) => setRuleContent(e.target.value)}
                placeholder="Write clear, enforceable rule text..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={rulePublished}
                onChange={(e) => setRulePublished(e.target.checked)}
                className="h-4 w-4 accent-[#144A34]"
              />
              <span>Publish immediately on public Guidelines &amp; Reservation forms</span>
            </label>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              {editingRuleId && (
                <button
                  type="button"
                  onClick={resetRuleForm}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{editingRuleId ? 'Update Rule' : 'Add Rule'}</span>
              </button>
            </div>
          </form>

          {/* Rules List */}
          <div className="space-y-3 lg:col-span-7">
            {sortedRules.map((rule, index) => (
              <article key={rule.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                      #{index + 1}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{rule.title}</h3>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            rule.published ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rule.published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{rule.content}</p>
                      <div className="mt-1.5 text-[11px] text-slate-400">
                        Updated {new Date(rule.updatedAt).toLocaleDateString()} by {rule.updatedBy}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveRule(index, -1)}
                      aria-label={`Move ${rule.title} up`}
                      className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sortedRules.length - 1}
                      onClick={() => handleMoveRule(index, 1)}
                      aria-label={`Move ${rule.title} down`}
                      className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateRule(rule.id, { published: !rule.published })}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {rule.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRuleId(rule.id);
                        setRuleTitle(rule.title);
                        setRuleContent(rule.content);
                        setRulePublished(rule.published);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteRule(rule)}
                      aria-label={`Delete rule ${rule.title}`}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Create / Edit Guideline Form */}
          <form onSubmit={handleSaveGuideline} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5 self-start">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {editingGuidelineId ? 'Edit Guideline' : 'Create New Guideline'}
            </h2>
            <div>
              <label htmlFor="gdl-cat" className="mb-1 block text-xs font-medium text-slate-700">
                Category <span className="text-rose-600">*</span>
              </label>
              <select
                id="gdl-cat"
                value={gdlCategory}
                onChange={(e) => setGdlCategory(e.target.value as GuidelineCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              >
                {GUIDELINE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gdl-title" className="mb-1 block text-xs font-medium text-slate-700">
                Guideline Title <span className="text-rose-600">*</span>
              </label>
              <input
                id="gdl-title"
                type="text"
                required
                minLength={3}
                value={gdlTitle}
                onChange={(e) => setGdlTitle(e.target.value)}
                placeholder="e.g. 05. Equipment & Whiteboard Care"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="gdl-desc" className="mb-1 block text-xs font-medium text-slate-700">
                Short Description <span className="text-rose-600">*</span>
              </label>
              <input
                id="gdl-desc"
                type="text"
                required
                minLength={5}
                value={gdlDescription}
                onChange={(e) => setGdlDescription(e.target.value)}
                placeholder="Summary shown under the guideline heading"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="gdl-instr" className="mb-1 block text-xs font-medium text-slate-700">
                Instruction Bullets (one per line) <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="gdl-instr"
                rows={4}
                required
                value={gdlInstructionsText}
                onChange={(e) => setGdlInstructionsText(e.target.value)}
                placeholder={'Enter each instruction on a new line...\nExample: Present valid school ID at the desk.'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#144A34] focus:outline-none"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={gdlPublished}
                onChange={(e) => setGdlPublished(e.target.checked)}
                className="h-4 w-4 accent-[#144A34]"
              />
              <span>Publish immediately on public Guidelines page</span>
            </label>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              {editingGuidelineId && (
                <button
                  type="button"
                  onClick={resetGuidelineForm}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#144A34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0E3525] disabled:opacity-60 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{editingGuidelineId ? 'Update Guideline' : 'Create Guideline'}</span>
              </button>
            </div>
          </form>

          {/* Guidelines List */}
          <div className="space-y-3 lg:col-span-7">
            {sortedGuidelines.map((item, index) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#144A34]/10 px-2 py-0.5 text-[11px] font-semibold text-[#144A34]">
                        {item.category}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          item.published ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {item.instructions.map((line, i) => (
                        <li key={i}>• {line}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveGuideline(index, -1)}
                      aria-label={`Move ${item.title} up`}
                      className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sortedGuidelines.length - 1}
                      onClick={() => handleMoveGuideline(index, 1)}
                      aria-label={`Move ${item.title} down`}
                      className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateGuideline(item.id, { published: !item.published })}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {item.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGuidelineId(item.id);
                        setGdlTitle(item.title);
                        setGdlCategory(item.category);
                        setGdlDescription(item.description);
                        setGdlInstructionsText(item.instructions.join('\n'));
                        setGdlPublished(item.published);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGuideline(item)}
                      aria-label={`Delete guideline ${item.title}`}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteRule)}
        title="Delete Library Rule"
        description={`Permanently delete rule "${confirmDeleteRule?.title || ''}"? This cannot be undone and will remove it from public view immediately.`}
        confirmLabel="Delete Rule"
        onCancel={() => setConfirmDeleteRule(null)}
        onConfirm={async () => {
          if (!confirmDeleteRule) return;
          const id = confirmDeleteRule.id;
          setConfirmDeleteRule(null);
          await onDeleteRule(id);
          setNotice('Rule deleted.');
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteGuideline)}
        title="Delete Library Guideline"
        description={`Permanently delete guideline "${confirmDeleteGuideline?.title || ''}"? This cannot be undone.`}
        confirmLabel="Delete Guideline"
        onCancel={() => setConfirmDeleteGuideline(null)}
        onConfirm={async () => {
          if (!confirmDeleteGuideline) return;
          const id = confirmDeleteGuideline.id;
          setConfirmDeleteGuideline(null);
          await onDeleteGuideline(id);
          setNotice('Guideline deleted.');
        }}
      />
    </div>
  );
}
