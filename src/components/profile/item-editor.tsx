'use client';

import { useState } from 'react';
import { PushPin, ArrowUUpLeft } from '@phosphor-icons/react';
import type { ProfileItem } from '@/lib/domain/types';
import { TYPE_FIELDS, payloadToForm, formToPayload, type FormValues } from './fields';
import FieldInputs from './field-inputs';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

interface ItemEditorProps {
  item: ProfileItem;
  /**
   * Sends a PATCH body for this item. Only changed fields go up:
   * { payload } | { pinned } | { revertText: true } — never canonicalText
   * from the form (the server re-derives it; manual text edits are a
   * separate surface in the preview screen, Task 13).
   */
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function ItemEditor({ item, onPatch, onDelete }: ItemEditorProps) {
  const defs = TYPE_FIELDS[item.type];
  const [values, setValues] = useState<FormValues>(() => payloadToForm(defs, item.payload));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = JSON.stringify(values) !== JSON.stringify(payloadToForm(defs, item.payload));

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      // Surface the server's plain-language field hint when there is one
      // (e.g. "Please check these fields: end"); only mask truly unknown fails.
      setError(e instanceof Error && e.message ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          {item.canonicalText.split('\n')[0].slice(0, 60)}
        </span>
        {item.source === 'import' && <Chip tone="neutral">Imported</Chip>}
        {item.provenance.length > 0 && <Chip>Enhanced</Chip>}
        {item.pinned && (
          <Chip tone="amber">
            <PushPin aria-hidden size={11} weight="fill" />
            Pinned
          </Chip>
        )}
      </div>

      <FieldInputs idPrefix={`item-${item.id}`} defs={defs} values={values} onChange={setValue} />

      {error && (
        <div role="alert" className="mt-3  bg-wash-red px-3 py-2 text-sm text-tone-red">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={() => run(() => onPatch({ payload: formToPayload(defs, values) }))}>
          Save
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          aria-pressed={item.pinned}
          onClick={() => run(() => onPatch({ pinned: !item.pinned }))}
        >
          <PushPin aria-hidden size={14} weight={item.pinned ? 'fill' : 'regular'} />
          {item.pinned ? 'Unpin' : 'Pin'}
        </Button>

        {item.provenance.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => onPatch({ revertText: true }))}
            title="Undo the accepted rewrite and restore the previous wording"
          >
            <ArrowUUpLeft aria-hidden size={14} />
            Revert wording
          </Button>
        )}

        {onDelete && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => run(onDelete)}
            className="ml-auto"
          >
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}
