import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useId } from 'react';

/* Square inputs on paper, thin line, pencil-red focus. Errors render under
   the field, wired with aria-describedby. */

const inputCls =
  'w-full border border-line-2 bg-surface px-4 py-2 text-sm text-ink ' +
  'placeholder:text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

const textareaCls =
  'w-full resize-y border border-line-2 bg-surface px-4 py-3 text-sm text-ink ' +
  'placeholder:text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

const selectCls =
  'border border-line-2 bg-surface px-4 py-2 text-sm text-ink ' +
  'transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  helper?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Public props shared by every field: label/helper/error, minus shell internals. */
type FieldProps = { label: string; helper?: string; error?: string; className?: string };

function FieldShell({ label, htmlFor, helper, error, children, className = '' }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {helper && !error && (
        <p id={`${htmlFor}-helper`} className="mt-1.5 text-xs leading-5 text-mute">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-sm text-tone-red">
          {error}
        </p>
      )}
    </div>
  );
}

export function InputField({
  label,
  helper,
  error,
  className,
  id: idProp,
  ...rest
}: FieldProps & ComponentPropsWithoutRef<'input'>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} htmlFor={id} helper={helper} error={error} className={className}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        className={inputCls}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextareaField({
  label,
  helper,
  error,
  className,
  id: idProp,
  ...rest
}: FieldProps & ComponentPropsWithoutRef<'textarea'>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} htmlFor={id} helper={helper} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        className={textareaCls}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  helper,
  error,
  className,
  id: idProp,
  children,
  ...rest
}: FieldProps & ComponentPropsWithoutRef<'select'>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} htmlFor={id} helper={helper} error={error} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        className={selectCls}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
