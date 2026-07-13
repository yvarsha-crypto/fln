import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  required,
  className = '',
  ...props
}) => {
  const inputId = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="space-y-1.5 w-full">
      <label htmlFor={inputId} className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider block">
        {label}
        {required && <span className="text-rose-600 ml-1" aria-label="required">*</span>}
      </label>
      <input id={inputId}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none transition focus:border-indigo-650 focus:ring-1 focus:ring-indigo-600 disabled:opacity-50 disabled:bg-slate-50 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200'
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="text-[10px] font-mono font-semibold text-red-600 block">{error}</span>
      )}
      {helperText && !error && (
        <span className="text-[10px] font-mono text-slate-400 block">{helperText}</span>
      )}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { label: string; value: string | number }[];
  required?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  required,
  className = '',
  ...props
}) => {
  const selectId = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="space-y-1.5 w-full">
      <label htmlFor={selectId} className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider block">
        {label}
        {required && <span className="text-rose-600 ml-1" aria-label="required">*</span>}
      </label>
      <select id={selectId}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 bg-white outline-none transition focus:border-indigo-650 focus:ring-1 focus:ring-indigo-600 disabled:opacity-50 disabled:bg-slate-50 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200'
        } ${className}`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[10px] font-mono font-semibold text-red-600 block">{error}</span>
      )}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  required?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  required,
  className = '',
  ...props
}) => {
  return (
    <div className="space-y-1.5 w-full">
      <label className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider block">
        {label}
        {required && <span className="text-rose-600 ml-1" aria-label="required">*</span>}
      </label>
      <textarea
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none transition focus:border-indigo-650 focus:ring-1 focus:ring-indigo-600 disabled:opacity-50 disabled:bg-slate-50 ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200'
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="text-[10px] font-mono font-semibold text-red-600 block">{error}</span>
      )}
    </div>
  );
};
