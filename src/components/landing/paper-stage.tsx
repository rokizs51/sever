'use client';

import { useState } from 'react';
import { buttonCls } from '@/components/ui/button';
import { useStage } from './stage-provider';
import {
  REWRITE,
  RECORD,
  ROLES,
  bulletById,
  type Bullet,
} from './record-data';

const wanted = (b: Bullet, wants: string[]) =>
  b.tags.some((t) => wants.includes(t)) ||
  wants.some((w) => b.text.toLowerCase().includes(w.toLowerCase()));

function Source({ b }: { b: Bullet }) {
  return (
    <p className="mt-0.5 text-[13px] text-mute">
      {b.company} · {b.period}
    </p>
  );
}

/**
 * The product's output as the page's fixed stage: one A4 sheet, built in
 * HTML from the sample record, re-setting itself as the story scrolls or the
 * visitor drives the slider and role index. Crossfades via key + .sheet-in.
 */
export default function Sheet() {
  const { stage, role } = useStage();
  const r = ROLES[role];
  // Derived: the accept only "sticks" while the sheet holds this exact
  // role+stage; re-setting the sheet (or undo) clears the key. No effect.
  const key = `${role}-${stage}`;
  const [appliedKey, setAppliedKey] = useState('');
  const accepted = appliedKey === key;

  const bullets = (b: Bullet, i: number) => {
    const marked = stage === 'paste' && wanted(b, r.wants);
    const isRewrite = stage === 'review' && b.id === REWRITE.id;
    return (
      <li
        key={b.id}
        className="demo-rise"
        style={{ animationDelay: `${i * 70}ms` }}
      >
        {isRewrite ? (
          <>
            <p className="text-[13px] text-mute line-through decoration-tone-red/70">
              {REWRITE.old}
            </p>
            <p className={`text-[14px] leading-5 ${accepted ? '' : 'font-medium'}`}>
              {b.text}
            </p>
            <Source b={b} />
            {accepted ? (
              <p className="mt-1.5 flex items-center gap-2 text-[13px]">
                <span className="text-tone-green">Applied to the draft</span>
                <button type="button" className={buttonCls('ghost', 'sm', 'px-2 py-0.5 min-h-0 text-[13px]')} onClick={() => setAppliedKey('')}>
                  Undo
                </button>
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-2">
                <button type="button" className={buttonCls('primary', 'sm')} onClick={() => setAppliedKey(key)}>
                  Accept
                </button>
                <button type="button" className={buttonCls('secondary', 'sm')}>
                  Not now
                </button>
                <span className="text-[13px] text-mute">yours until you say so</span>
              </p>
            )}
          </>
        ) : (
          <>
            <p
              className={`text-[14px] leading-5 ${
                marked
                  ? 'underline decoration-[var(--tone-red)] decoration-2 underline-offset-4'
                  : ''
              }`}
            >
              {b.text}
            </p>
            <Source b={b} />
          </>
        )}
      </li>
    );
  };

  const kept = r.keep.map(bulletById);
  const cut = r.setAside.map(({ id, reason }) => ({ b: bulletById(id), reason }));

  return (
    <div
      data-ui
      role="region"
      aria-label={`Your CV sheet, ${stage} stage`}
      className="w-[min(520px,100%)] bg-surface px-8 py-7 text-ink"
    >
      <div key={`${role}-${stage}`} className="sheet-in">
        <p className="text-[13px] leading-5 text-tone-red" aria-live="polite">
          {stage === 'record' && 'your record, entered once'}
          {stage === 'paste' && `reading the posting: ${r.wants.slice(0, 4).join(' · ')}…`}
          {stage === 'tailor' && `reordered for: ${r.label}`}
          {stage === 'review' && 'one proposal awaits your call'}
        </p>
        <p className="mt-2 text-[22px] font-semibold leading-none">Alex Moreau</p>
        <p className="mt-1 text-[15px] font-medium">{r.title}</p>
        {/* Two short bylines, one dot each: a document header, not a meta string. */}
        <p className="mt-1 text-[13px] text-mute">Berlin · +49</p>
        <p className="text-[13px] text-mute">alex.moreau@mail.dev · 6 yrs</p>

        {stage === 'record' || stage === 'paste' ? (
          <section className="mt-5">
            <p className="text-[15px] font-semibold">Experience</p>
            <ul className="mt-2 space-y-3">{RECORD.map(bullets)}</ul>
          </section>
        ) : (
          <>
            <section className="mt-5">
              <p className="text-[15px] font-semibold">Experience</p>
              <ul className="mt-2 space-y-3">{kept.map(bullets)}</ul>
            </section>
            <section className="mt-5 bg-surface-2 px-4 py-3">
              <p className="text-[13px] font-medium text-mute">
                Set aside, with the reason
              </p>
              <ul className="mt-2 space-y-2">
                {cut.map(({ b, reason }) => (
                  <li key={b.id} className="text-[13px] leading-5">
                    <span className="text-mute line-through decoration-line-2">
                      {b.text}
                    </span>{' '}
                    <span className="text-tone-red">({reason})</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <p className="mt-6 text-[13px] text-mute">
          31 items on record. The CV can only say what these prove.
        </p>
      </div>
    </div>
  );
}
