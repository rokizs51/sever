'use client';

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { ItemType } from '@/lib/domain/types';
import { TYPE_FIELDS, TYPE_LABELS, formToPayload, type FormValues } from './fields';
import FieldInputs from './field-inputs';
import Card from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SectionFormProps {
  type: ItemType;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}

/**
 * Collapsed "Add …" pill that expands into plain-language fields for one
 * entry of this section's type. Validation lives server-side (strict zod);
 * failures surface inline.
 */
export default function SectionForm({ type, onCreate }: SectionFormProps) {
  const defs = TYPE_FIELDS[type];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await onCreate(formToPayload(defs, values));
      setValues({});
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not add this entry. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 cursor-pointer items-center gap-1.5  border border-dashed border-line-2 px-4 py-2 text-sm font-medium text-mute transition-colors hover:border-line-2 hover:bg-surface-2 hover:text-ink active:scale-[0.97]"
      >
        <Plus aria-hidden size={15} weight="bold" />
        Add {TYPE_LABELS[type].toLowerCase()}
      </button>
    );
  }

  return (
    <Card border="border-primary/50" className="p-5">
      <FieldInputs
        idPrefix={`add-${type}`}
        defs={defs}
        values={values}
        onChange={(key, value) => setValues((p) => ({ ...p, [key]: value }))}
      />

      {error && (
        <div role="alert" className="mt-3  bg-wash-red px-3 py-2 text-sm text-tone-red">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
