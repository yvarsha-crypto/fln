import React from 'react';

export interface RadioOption {
  label: string;
  value: string;
}

interface RadioGroupProps {
  label: string;
  name: string;
  value: string;
  options: RadioOption[];
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  layout?: 'horizontal' | 'vertical';
}

/**
 * Reusable radio-group form control.
 *
 * Mirrors the styling of `<Input>` from `Form.tsx` so it slots into the
 * RegisterStudentView's form grid without visual drift.
 */
export const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  name,
  value,
  options,
  onChange,
  error,
  helperText,
  disabled = false,
  required = false,
  className = '',
  layout = 'horizontal',
}) => {
  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      <label className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider block">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      <div
        className={
          layout === 'horizontal'
            ? 'flex flex-wrap gap-3'
            : 'flex flex-col gap-2'
        }
        role="radiogroup"
        aria-label={label}
      >
        {options.map((opt) => {
          const isChecked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition select-none ${
                isChecked
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
                error ? 'border-red-300' : ''
              }`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={isChecked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={!!error}
                className="w-3.5 h-3.5 text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold">{opt.label}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <span className="text-[10px] font-mono font-semibold text-red-600 block">
          {error}
        </span>
      )}
      {helperText && !error && (
        <span className="text-[10px] font-mono text-slate-400 block">{helperText}</span>
      )}
    </div>
  );
};