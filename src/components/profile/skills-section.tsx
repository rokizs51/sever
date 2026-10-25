'use client';

import { useState, type FormEvent } from 'react';
import { Plus, PushPin, ArrowUUpLeft, Trash, X, CheckCircle } from '@phosphor-icons/react';
import type { ProfileItem } from '@/lib/domain/types';
import { SKILL_LEVELS } from './fields';
import Card from '@/components/ui/card';
import Chip from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

export interface SkillDraft {
  name: string;
  level?: string;
}

interface SkillsSectionProps {
  items: ProfileItem[];
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Sends every queued skill to the server in one batch call. */
  onCreateBatch: (payloads: SkillDraft[]) => Promise<void>;
}

// Compact pill controls — roomy field variants would re-inflate the page we
// are trying to shorten. Row inputs carry aria-labels; the section states the
// pattern once in helper text instead of repeating labels per row.
const inputCls =
  'min-w-40 flex-1  border border-line-2 bg-surface px-4 py-2 text-sm text-ink ' +
  'transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

const nameOf = (item: ProfileItem) => String(item.payload.name ?? '');
const levelOf = (item: ProfileItem) => String(item.payload.level ?? '');

function LevelSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  // Items saved before the dropdown existed may hold free-text levels; keep
  // them visible and selectable instead of silently blanking them.
  const legacy = value && !SKILL_LEVELS.includes(value) ? [value] : [];
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-36 cursor-pointer  border border-line-2 bg-surface px-4 py-2 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="">No level</option>
      {legacy.map((l) => (
        <option key={l} value={l}>{l}</option>
      ))}
      {SKILL_LEVELS.map((l) => (
        <option key={l} value={l}>{l}</option>
      ))}
    </select>
  );
}

export default function SkillsSection({ items, onPatch, onDelete, onCreateBatch }: SkillsSectionProps) {
  const [addName, setAddName] = useState('');
  const [addLevel, setAddLevel] = useState('');
  const [pending, setPending] = useState<{ name: string; level: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const queueSkill = () => {
    const name = addName.trim();
    if (!name) return;
    const taken = new Set([
      ...items.map((i) => nameOf(i).toLowerCase()),
      ...pending.map((p) => p.name.toLowerCase()),
    ]);
    if (taken.has(name.toLowerCase())) {
      setError(`"${name}" is already on your list.`);
      return;
    }
    setError('');
    setSaved(false);
    setPending((p) => [...p, { name, level: addLevel }]);
    setAddName('');
    setAddLevel('');
  };

  const saveAll = () =>
    run(async () => {
      await onCreateBatch(
        pending.map((p) => ({ name: p.name, ...(p.level ? { level: p.level } : {}) }))
      );
      setPending([]);
      setSaved(true);
    });

  return (
    <Card className="p-4 sm:p-5">
      {items.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                defaultValue={nameOf(item)}
                aria-label={`Name of ${nameOf(item)}`}
                className={inputCls}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) {
                    e.target.value = nameOf(item);
                    return;
                  }
                  if (name === nameOf(item)) return;
                  // One PATCH per committed edit (blur), same cost as the old
                  // per-card Save button.
                  run(() =>
                    onPatch(item.id, { payload: { ...item.payload, name } }).catch((err) => {
                      e.target.value = nameOf(item);
                      throw err;
                    })
                  );
                }}
              />
              <LevelSelect
                label={`Level for ${nameOf(item)}`}
                value={levelOf(item)}
                onChange={(level) =>
                  run(() =>
                    onPatch(item.id, {
                      payload: level ? { name: nameOf(item), level } : { name: nameOf(item) },
                    })
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-pressed={item.pinned}
                aria-label={item.pinned ? `Unpin ${nameOf(item)}` : `Pin ${nameOf(item)}`}
                onClick={() => run(() => onPatch(item.id, { pinned: !item.pinned }))}
              >
                <PushPin aria-hidden size={14} weight={item.pinned ? 'fill' : 'regular'} />
              </Button>
              {item.provenance.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Revert wording of ${nameOf(item)}`}
                  title="Undo the accepted rewrite and restore the previous wording"
                  onClick={() => run(() => onPatch(item.id, { revertText: true }))}
                >
                  <ArrowUUpLeft aria-hidden size={14} />
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                aria-label={`Delete ${nameOf(item)}`}
                onClick={() => run(() => onDelete(item.id))}
              >
                <Trash aria-hidden size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          queueSkill();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          aria-label="New skill name"
          placeholder="e.g. Python"
          className={inputCls}
        />
        <LevelSelect label="Level for the new skill" value={addLevel} onChange={setAddLevel} />
        <Button type="submit" variant="soft" size="sm" disabled={busy || !addName.trim()}>
          <Plus aria-hidden size={14} weight="bold" />
          Add
        </Button>
      </form>

      {pending.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pending.map((p, i) => (
            <Chip key={`${p.name}-${i}`}>
              {p.name}
              {p.level ? ` (${p.level})` : ''}
              <button
                type="button"
                aria-label={`Remove ${p.name} from the queue`}
                onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                className="-mr-1.5 flex size-7 cursor-pointer items-center justify-center opacity-70 transition-opacity hover:opacity-100"
              >
                <X aria-hidden size={12} weight="bold" />
              </button>
            </Chip>
          ))}
          <Button size="sm" disabled={busy} onClick={saveAll}>
            {busy ? 'Saving…' : `Save ${pending.length} skill${pending.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      )}

      {saved && (
        <span role="status" className="mt-3 inline-flex items-center gap-1.5 text-sm text-tone-green">
          <CheckCircle aria-hidden size={16} weight="fill" />
          Saved.
        </span>
      )}

      <p className="mt-3 text-xs leading-5 text-mute">
        Type a skill (or press Enter) to queue it. Nothing is sent until you save the whole
        batch. Levels show on your CV as “Python (Advanced)”.
      </p>

      {error && (
        <div role="alert" className="mt-3  bg-wash-red px-3 py-2 text-sm text-tone-red">
          {error}
        </div>
      )}
    </Card>
  );
}
