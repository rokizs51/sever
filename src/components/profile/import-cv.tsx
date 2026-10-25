'use client';

import { useMemo, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import type { ProfileItem } from '@/lib/domain/types';
import type { FinalizedCvImport } from '@/lib/domain/cv-import';
import { importKey } from '@/lib/domain/cv-import';
import { canonicalTextFor } from '@/lib/domain/canonical';
import { PAYLOAD_SCHEMAS } from '@/lib/domain/schemas';
import { fieldHint } from '@/lib/domain/validation';
import { TYPE_FIELDS, TYPE_LABELS, payloadToForm, formToPayload, type FormValues } from './fields';
import FieldInputs from './field-inputs';
import Card, { SectionHeading } from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { Button, buttonCls } from '@/components/ui/button';

interface PersonalForm {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: string;
}

const EMPTY_PERSONAL: PersonalForm = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  links: '',
};

function hasPersonalValues(p: PersonalForm): boolean {
  return [p.fullName, p.email, p.phone, p.location, p.links].some((v) => v.trim() !== '');
}

function friendly(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case 'unauthorized':
      return 'Your session expired. Sign in again and try once more.';
    case 'pdf_no_text':
      return 'This PDF has no selectable text (it may be a scan). Paste the text instead.';
    case 'not_a_pdf':
      return 'That file is not a PDF. Choose a .pdf file or paste the text.';
    case 'file_too_large':
      return 'The PDF must be 4 MB or smaller.';
    case 'pdf_unreadable':
      return 'We could not read this PDF. Try pasting its text instead.';
    case 'too_short':
      return 'Please paste more of your CV.';
    case 'too_long':
      return 'That CV is too long to read in one pass. Paste only the sections you want imported.';
    case 'not_a_cv':
      return 'We could not read this as a CV. Check that you pasted the whole document and try again.';
    case 'budget_exhausted':
      return 'AI reading is paused while this month’s AI budget recovers.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}

const inputCls =
  'w-full  border border-line-2 bg-surface px-4 py-2 text-sm text-ink transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

function PersonalField({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-mute">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  );
}

/**
 * Two-step CV import: read a pasted CV / uploaded PDF into a draft, then let
 * the user edit and select entries before a single commit. Nothing touches the
 * profile until they press Add. Imported entries are marked `source: 'import'`.
 */
export default function ImportCv({
  existingItems,
  onImported,
}: {
  existingItems: ProfileItem[];
  onImported: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [draft, setDraft] = useState<FinalizedCvImport | null>(null);
  const [edits, setEdits] = useState<FormValues[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [personal, setPersonal] = useState<PersonalForm>(EMPTY_PERSONAL);

  const hasSnapshot = existingItems.some((item) => item.type === 'career_snapshot');

  const duplicateFlags = useMemo(() => {
    if (!draft) return [];
    const keys = new Set(existingItems.map((item) => importKey(item.canonicalText)));
    return draft.items.map((item, index) => {
      const values = edits[index];
      if (!values) return false;
      const payload = formToPayload(TYPE_FIELDS[item.type], values);
      return keys.has(importKey(canonicalTextFor(item.type, payload)));
    });
  }, [draft, edits, existingItems]);

  // An edit can turn a selected entry into a duplicate; the count must match
  // what commit will actually send.
  const selectedCount = selected.filter((value, index) => value && !duplicateFlags[index]).length;

  const resetDraft = () => {
    setDraft(null);
    setEdits([]);
    setSelected([]);
    setPersonal(EMPTY_PERSONAL);
    setError('');
  };

  const loadDraft = (next: FinalizedCvImport) => {
    const keys = new Set(existingItems.map((item) => importKey(item.canonicalText)));
    setDraft(next);
    setEdits(next.items.map((item) => payloadToForm(TYPE_FIELDS[item.type], item.payload)));
    setSelected(
      next.items.map((item) => {
        if (item.type === 'career_snapshot' && hasSnapshot) return false;
        return !keys.has(importKey(item.canonicalText));
      })
    );
    setPersonal({
      fullName: next.personal.fullName,
      email: next.personal.email,
      phone: next.personal.phone ?? '',
      location: next.personal.location ?? '',
      links: next.personal.links.join(', '),
    });
    setError('');
  };

  const read = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      if (file && file.size > 4 * 1024 * 1024) {
        setError('The PDF must be 4 MB or smaller.');
        return;
      }
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        res = await fetch('/api/profile/import', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/profile/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(friendly(data?.error?.code, data?.error?.message));
        return;
      }
      loadDraft(data.draft as FinalizedCvImport);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!draft) return;
    const chosen = draft.items
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => selected[index] && !duplicateFlags[index]);
    if (chosen.length === 0) {
      setError('Select at least one entry to add.');
      return;
    }

    const items: { type: string; payload: Record<string, unknown> }[] = [];
    for (const { item, index } of chosen) {
      const payload = formToPayload(TYPE_FIELDS[item.type], edits[index] ?? {});
      const parsed = PAYLOAD_SCHEMAS[item.type].safeParse(payload);
      if (!parsed.success) {
        setError(`${TYPE_LABELS[item.type]} entry: ${fieldHint(parsed.error.issues)}`);
        return;
      }
      items.push({ type: item.type, payload: parsed.data });
    }

    const personalPayload = hasPersonalValues(personal)
      ? {
          fullName: personal.fullName,
          email: personal.email,
          phone: personal.phone || null,
          location: personal.location || null,
          links: personal.links.split(',').map((s) => s.trim()).filter(Boolean),
        }
      : undefined;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/profile/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, personal: personalPayload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(friendly(data?.error?.code, data?.error?.message));
        return;
      }

      await onImported();
      const notes = [
        `Added ${data.created} ${data.created === 1 ? 'entry' : 'entries'}.`,
      ];
      if (data.skipped?.duplicates) {
        notes.push(
          `Skipped ${data.skipped.duplicates} duplicate${data.skipped.duplicates === 1 ? '' : 's'}.`
        );
      }
      if (data.skipped?.careerSummary) notes.push('Kept your existing career summary.');
      if (data.personalSkipped) {
        notes.push('Contact details were not changed — check them below.');
      }
      resetDraft();
      setText('');
      setFile(null);
      setDone(notes.join(' '));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionHeading className="mb-1">Import an existing CV</SectionHeading>
          <p className="max-w-lg text-sm leading-6 text-mute">
            Already have a CV? Read it into your profile, check every entry, then add
            it. Nothing is added until you say so.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
          <UploadSimple aria-hidden size={18} weight="bold" />
          Import a CV
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionHeading>Import an existing CV</SectionHeading>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setDone('');
          }}
          className={buttonCls('ghost', 'sm', 'border-none bg-transparent')}
        >
          Close
        </button>
      </div>

      {done && (
        <p role="status" className="mb-3  bg-wash-green px-4 py-3 text-sm text-tone-green">
          {done}
        </p>
      )}

      {!draft ? (
        <div className="space-y-4">
          <p className="text-sm text-mute">
            Paste the text of your CV, or upload a PDF. We read it into your profile
            — you review every entry before it is added.
          </p>
          <div>
            <label htmlFor="cv-import-text" className="mb-1 block text-sm font-medium text-ink">
              Your CV
            </label>
            <textarea
              id="cv-import-text"
              rows={10}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError('');
              }}
              disabled={!!file}
              placeholder="Paste your CV here…"
              className="w-full resize-y  border border-line-2 bg-surface px-4 py-3 text-sm text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className={buttonCls('secondary', 'sm', 'cursor-pointer')}>
              <UploadSimple aria-hidden size={16} weight="bold" />
              Choose a PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError('');
                }}
              />
            </label>
            {file && (
              <span className="flex items-center gap-2 text-sm text-mute">
                {file.name}
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Remove
                </button>
              </span>
            )}
          </div>
          {file && (
            <p className="text-xs leading-5 text-mute">
              Scanned PDFs without selectable text need copy-paste instead.
            </p>
          )}

          {error && (
            <div role="alert" className=" bg-wash-red px-4 py-3 text-sm text-tone-red">
              {error}
            </div>
          )}

          <Button onClick={read} disabled={busy || (!file && text.trim().length < 100)}>
            <UploadSimple aria-hidden size={16} weight="bold" />
            {busy ? 'Reading…' : 'Read my CV'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p role="status" className="text-sm text-mute">
            We found {draft.items.length} {draft.items.length === 1 ? 'entry' : 'entries'}.
            Check and edit anything before adding.
          </p>

          {draft.warnings.length > 0 && (
            <ul className="space-y-1  border border-line bg-wash-amber px-4 py-3 text-sm text-tone-amber">
              {draft.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {hasPersonalValues(personal) && (
            <div className="border border-line p-4">
              <p className="text-sm font-medium text-ink">Contact details</p>
              <p className="mb-3 text-xs leading-5 text-mute">
                Only fields that are currently empty will be filled. Your existing
                details are never overwritten.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PersonalField
                  id="import-full-name"
                  label="Full name"
                  value={personal.fullName}
                  onChange={(v) => setPersonal((p) => ({ ...p, fullName: v }))}
                />
                <PersonalField
                  id="import-email"
                  label="Email"
                  type="email"
                  value={personal.email}
                  onChange={(v) => setPersonal((p) => ({ ...p, email: v }))}
                />
                <PersonalField
                  id="import-phone"
                  label="Phone (optional)"
                  value={personal.phone}
                  onChange={(v) => setPersonal((p) => ({ ...p, phone: v }))}
                />
                <PersonalField
                  id="import-location"
                  label="Location (optional)"
                  value={personal.location}
                  onChange={(v) => setPersonal((p) => ({ ...p, location: v }))}
                />
                <div className="sm:col-span-2">
                  <PersonalField
                    id="import-links"
                    label="Links, comma separated"
                    value={personal.links}
                    onChange={(v) => setPersonal((p) => ({ ...p, links: v }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {draft.items.map((item, index) => {
              const blocked =
                duplicateFlags[index] ||
                (item.type === 'career_snapshot' && hasSnapshot);
              return (
                <div
                  key={`${item.type}-${index}`}
                  className={
                    'border border-line p-4 ' + (blocked ? 'opacity-70' : '')
                  }
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      id={`import-include-${index}`}
                      checked={(selected[index] ?? false) && !blocked}
                      disabled={blocked}
                      onChange={() =>
                        setSelected((prev) =>
                          prev.map((value, i) => (i === index ? !value : value))
                        )
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                    <label
                      htmlFor={`import-include-${index}`}
                      className="text-sm font-medium text-ink"
                    >
                      {TYPE_LABELS[item.type]}
                    </label>
                    {duplicateFlags[index] && <Chip tone="neutral">Already in your profile</Chip>}
                    {item.type === 'career_snapshot' && hasSnapshot && (
                      <Chip tone="amber">You already have a summary</Chip>
                    )}
                  </div>
                  <FieldInputs
                    idPrefix={`import-${index}`}
                    defs={TYPE_FIELDS[item.type]}
                    values={edits[index] ?? {}}
                    onChange={(key, value) =>
                      setEdits((prev) =>
                        prev.map((values, i) =>
                          i === index ? { ...values, [key]: value } : values
                        )
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          {error && (
            <div role="alert" className=" bg-wash-red px-4 py-3 text-sm text-tone-red">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={commit} disabled={busy || selectedCount === 0}>
              {busy
                ? 'Adding…'
                : `Add ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} to my profile`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={resetDraft}>
              Start over
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}