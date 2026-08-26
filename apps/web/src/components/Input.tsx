import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className = '', ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={`w-full h-9 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors ${
            icon ? 'pl-9 pr-3' : 'px-3'
          } ${className}`}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

const EMPTY_VALUE = '__empty__';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder,
  className = '',
  disabled,
  name,
}) => {
  const hasEmptyOption = options.some((opt) => opt.value === '');
  const rootValue = value === '' ? (hasEmptyOption ? EMPTY_VALUE : undefined) : value;

  return (
    <SelectPrimitive.Root
      value={rootValue}
      onValueChange={(v) => onValueChange(v === EMPTY_VALUE ? '' : v)}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        className={`w-full flex items-center justify-between gap-2 h-9 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl px-3 text-xs text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors data-[placeholder]:text-[var(--color-text-muted)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${className}`}
      >
        <span className="truncate whitespace-nowrap text-left flex-1 min-w-0">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon className="shrink-0 ml-1">
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-lg p-1"
        >
          <SelectPrimitive.Viewport className="p-0.5">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value || EMPTY_VALUE}
                value={opt.value === '' ? EMPTY_VALUE : opt.value}
                disabled={opt.disabled}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] rounded-lg cursor-pointer outline-none data-[highlighted]:bg-[var(--color-brand-500)]/10 data-[highlighted]:text-[var(--color-brand-400)] data-[disabled]:opacity-50 data-[disabled]:pointer-events-none transition-colors"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`w-full bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors ${className}`}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', checked, onChange, disabled, id, ...props }, ref) => {
    const inputId = id || (label ? `cb-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        } ${className}`}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={inputId}
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div className="w-4 h-4 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-base)] peer-checked:bg-[var(--color-brand-500)] peer-checked:border-[var(--color-brand-500)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-brand-500)]/30 transition-all flex items-center justify-center shadow-2xs">
            <Check className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity stroke-[2.5]" />
          </div>
        </div>
        {(label || description) && (
          <div className="min-w-0 text-left">
            {label && <div className="text-xs font-medium text-[var(--color-text-primary)] leading-tight">{label}</div>}
            {description && <div className="text-[11px] text-[var(--color-text-muted)] leading-tight mt-0.5">{description}</div>}
          </div>
        )}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';
