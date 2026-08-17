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
          className={`w-full bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-sm py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-[0.5px] focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors ${
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
        className={`w-full flex items-center justify-between gap-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-sm text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-[0.5px] focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors data-[placeholder]:text-[var(--color-text-muted)] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 overflow-hidden bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-sm shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value || EMPTY_VALUE}
                value={opt.value === '' ? EMPTY_VALUE : opt.value}
                disabled={opt.disabled}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] rounded-xs cursor-pointer outline-none data-[highlighted]:bg-[var(--color-brand-500)]/10 data-[highlighted]:text-[var(--color-brand-400)] data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="w-4 h-4 text-[var(--color-brand-400)]" />
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
    className={`w-full bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-sm px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand-500)] focus:ring-[0.5px] focus:ring-[var(--color-brand-500)] focus:outline-none transition-colors ${className}`}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
