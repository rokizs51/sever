'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import type { ItemType, ProfileItem } from '@/lib/domain/types';
import ItemEditor from './item-editor';
import ImportCv from './import-cv';
import SectionForm from './section-form';
import SkillsSection, { type SkillDraft } from './skills-section';
import { TYPE_LABELS } from './fields';
import Card, { SectionHeading } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Personal {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  links: string[];
}

// Editor groups in profile-building order (not CV order — ordering of CV
// sections is the fit engine's job).
const SECTION_ORDER: ItemType[] = [
  'career_snapshot',
  'experience',
  'project',
  'education',
  'certification',
  'skill',
  'award',
  'language',
];

export default function ProfileEditor() {
  const [items, setItems] = useState<ProfileItem[] | null>(null);
  const [personal, setPersonal] = useState<Personal | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const [pRes, iRes] = await Promise.all([
      fetch('/api/profile'),
      fetch('/api/profile/items'),
    ]);
    if (!pRes.ok || !iRes.ok) {
      setLoadError('Could not load your profile. Please sign in again.');
      return;
    }
    const pData = await pRes.json();
    const iData = await iRes.json();
    setPersonal(pData.profile.personal);
    setItems(iData.items);
  }, []);

  useEffect(() => {
    load().catch(() => setLoadError('Could not load your profile. Please sign in again.'));
  }, [load]);

  const patchItem = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/profile/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'save failed');
    await load();
  };

  const deleteItem = async (id: string) => {
    const res = await fetch(`/api/profile/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json().catch(() => (null)))?.error?.message ?? 'delete failed');
    await load();
  };

  const createItem = async (type: ItemType, payload: Record<string, unknown>) => {
    const res = await fetch('/api/profile/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'create failed');
    await load();
  };

  const createSkillBatch = async (payloads: SkillDraft[]) => {
    const res = await fetch('/api/profile/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'skill', payloads }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? 'create failed');
    await load();
  };

  if (loadError) {
    return (
      <p role="alert" className=" bg-wash-red px-4 py-3 text-sm text-tone-red">
        {loadError}
      </p>
    );
  }
  if (!items || !personal) {
    return (
      <div className="space-y-6" aria-label="Loading your profile">
        <p className="sr-only">Loading your profile…</p>
        {[0, 1, 2, 3].map((i) => {
          const skel = 'animate-pulse bg-surface p-5'; // taste-skill-ignore: standard skeleton affordance
          return (
            <div key={i} aria-hidden className={skel}>
              <div className="mb-3 h-4 w-1/3 bg-surface-2" />
              <div className="mb-2 h-3 w-full bg-surface-2" />
              <div className="h-3 w-2/3 bg-surface-2" />
            </div>
          );
        })}
      </div>
    );
  }

  const byType = (t: ItemType) => items.filter((i) => i.type === t);

  return (
    <div className="space-y-10">
      <ImportCv existingItems={items} onImported={load} />
      <PersonalSection personal={personal} onSaved={load} />

      {SECTION_ORDER.map((type) => {
        const sectionItems = byType(type);
        // Skills use a dedicated compact editor: one card with a queue that
        // saves all new skills in a single batch call (the generic per-item
        // cards made this section vertically huge for real skill lists).
        if (type === 'skill') {
          return (
            <section key={type}>
              <SectionHeading className="mb-2">Skills</SectionHeading>
              {sectionItems.length === 0 && (
                <p className="mb-3 text-sm text-mute">
                  Nothing here yet. Add what applies to you.
                </p>
              )}
              <SkillsSection
                items={sectionItems}
                onPatch={patchItem}
                onDelete={deleteItem}
                onCreateBatch={createSkillBatch}
              />
            </section>
          );
        }
        return (
          <section key={type}>
            <SectionHeading className="mb-2">{TYPE_LABELS[type]}</SectionHeading>
            {type !== 'career_snapshot' && sectionItems.length === 0 && (
              <p className="mb-3 text-sm text-mute">
                Nothing here yet. Add what applies to you.
              </p>
            )}
            {type === 'career_snapshot' && sectionItems.length === 0 && (
              <p className="mb-3 text-sm text-mute">
                One or two lines about who you are professionally. Your CV headline is built from this.
              </p>
            )}
            <div className="space-y-3">
              {sectionItems.map((item) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  onPatch={(body) => patchItem(item.id, body)}
                  onDelete={type === 'career_snapshot' && sectionItems.length === 1 ? undefined : () => deleteItem(item.id)}
                />
              ))}
            </div>
            {(type !== 'career_snapshot' || sectionItems.length === 0) && (
              <div className="mt-3">
                <SectionForm type={type} onCreate={(payload) => createItem(type, payload)} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PersonalSection({ personal, onSaved }: { personal: Personal; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    fullName: personal.fullName,
    email: personal.email,
    phone: personal.phone ?? '',
    location: personal.location ?? '',
    links: personal.links.join(', '),
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const edit = (key: keyof typeof form, v: string) => {
    setForm((p) => ({ ...p, [key]: v }));
    setSaved(false); // an unsaved edit invalidates the previous 'Saved.'
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personal: {
            fullName: form.fullName,
            email: form.email,
            phone: form.phone || null,
            location: form.location || null,
            links: form.links.split(',').map((s) => s.trim()).filter(Boolean),
          },
        }),
      });
      if (!res.ok) {
        // Don't blame the user's input for an auth/server failure: use the
        // server's message when present, generic text otherwise.
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          setError('Your session expired. Sign in again and try once more.');
          return;
        }
        setError(data?.error?.message || 'Could not save. Please try again.');
        return;
      }
      setSaved(true);
      await onSaved();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div>
      <label htmlFor={`personal-${key}`} className="mb-1 block text-xs font-medium text-mute">
        {label}
      </label>
      <input
        id={`personal-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => edit(key, e.target.value)}
        className="w-full  border border-line-2 bg-surface px-4 py-2 text-sm text-ink transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );

  return (
    <section>
      <SectionHeading className="mb-3">Your details</SectionHeading>
      <Card className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        {field('fullName', 'Full name')}
        {field('email', 'Email', 'email')}
        {field('phone', 'Phone (optional)')}
        {field('location', 'Location (optional)')}
        <div className="sm:col-span-2">{field('links', 'Links, comma separated (GitHub, LinkedIn…)', 'text')}</div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-tone-green">
              <CheckCircle aria-hidden size={16} weight="fill" />
              Saved.
            </span>
          )}
          {error && <span role="alert" className="text-sm text-tone-red">{error}</span>}
        </div>
      </Card>
    </section>
  );
}
