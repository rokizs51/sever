'use client';

import type { FieldDef, FormValues } from './fields';

const inputCls =
  'w-full  border border-line-2 bg-surface px-4 py-2 text-sm text-ink transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const textareaCls =
  'w-full resize-y  border border-line-2 bg-surface px-4 py-3 text-sm text-ink transition-colors placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

/**
 * The one place type-specific fields are rendered. Add form, editor, and CV
 * import all use it, so a field added to TYPE_FIELDS appears everywhere.
 */
export default function FieldInputs({
  idPrefix,
  defs,
  values,
  onChange,
}: {
  idPrefix: string;
  defs: FieldDef[];
  values: FormValues;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {defs.map((def) => {
        const id = `${idPrefix}-${def.key}`;
        const wide = def.kind === 'textarea' || def.kind === 'lines';
        return (
          <div key={def.key} className={wide ? 'sm:col-span-2' : ''}>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-mute">
              {def.label}
            </label>
            {wide ? (
              <textarea
                id={id}
                rows={def.kind === 'lines' ? 4 : 3}
                value={values[def.key] ?? ''}
                onChange={(e) => onChange(def.key, e.target.value)}
                className={textareaCls}
              />
            ) : (
              <input
                id={id}
                type={def.kind === 'number' ? 'number' : 'text'}
                value={values[def.key] ?? ''}
                onChange={(e) => onChange(def.key, e.target.value)}
                className={inputCls}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}