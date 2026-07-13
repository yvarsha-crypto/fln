import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ChevronDown } from 'lucide-react';

export type IdentityType = 'aadhaar' | 'birth_cert';

interface IdentityInputProps {
  value: string;
  error?: string;
  helperText?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onTypeChange?: (type: IdentityType) => void;
  identityType?: IdentityType;
  required?: boolean;
}

const AADHAAR_HELPER = '12-digit Aadhaar number. Stored securely; displayed masked in lists.';
const BC_HELPER = '8–25 character alphanumeric Birth Certificate number. Stored securely; displayed masked in lists.';

export const IdentityInput: React.FC<IdentityInputProps> = ({
  value,
  error,
  helperText,
  onChange,
  onBlur,
  onTypeChange,
  identityType,
  required,
}) => {
  const [reveal, setReveal] = useState(false);
  const [focused, setFocused] = useState(false);
  const [internalType, setInternalType] = useState<IdentityType>(identityType || 'aadhaar');

  useEffect(() => {
    if (identityType && identityType !== internalType) {
      setInternalType(identityType);
    }
  }, [identityType]);

  const type: IdentityType = identityType || internalType;

  const handleTypeChange = (next: IdentityType) => {
    if (!identityType) setInternalType(next);
    if (next !== type) {
      onChange('');
      if (onTypeChange) onTypeChange(next);
    }
  };

  // Mask helpers
  const maskAadhaar = (val: string) => 'X'.repeat(8) + val.slice(-4);
  const maskBc = (val: string) =>
    val.length > 4 ? 'X'.repeat(val.length - 4) + val.slice(-4) : val;
  const maskValue = (val: string) =>
    type === 'aadhaar' ? maskAadhaar(val) : maskBc(val);

  const display = !reveal && !focused && value ? maskValue(value) : value;

  // Per-type input rules
  const inputMode: 'numeric' | 'text' = type === 'aadhaar' ? 'numeric' : 'text';
  const maxLength = type === 'aadhaar' ? 12 : 25;
  const placeholderAadhaar = 'e.g. 123412341234';
  const placeholderBc = 'e.g. BC2017AM1234';
  const placeholderForType = type === 'aadhaar' ? placeholderAadhaar : placeholderBc;
  const autoHint = type === 'aadhaar' ? AADHAAR_HELPER : BC_HELPER;

  // Input id is stable — based on the current type so the label is always attached
  const inputId = `identity-${type}-no`;

  const handleChange = (raw: string) => {
    let next = raw;
    if (type === 'aadhaar') {
      next = next.replace(/\D/g, '').slice(0, 12);
    } else {
      next = next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 25);
    }
    onChange(next);
  };

  return (
    <div className="space-y-1.5 w-full">
      {/* Row 1: dropdown is the heading itself (in place of the static text label) */}
      <div className="flex items-center gap-2 flex-wrap">
        <label
          htmlFor={`${inputId}-type`}
          className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider"
        >
          Identity Document Type
          {required && <span className="text-rose-600 ml-1" aria-label="required">*</span>}
        </label>
        <div className="relative">
          <select
            id={`${inputId}-type`}
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as IdentityType)}
            className="appearance-none cursor-pointer text-sm font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md pl-3 pr-8 py-1 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 transition-colors hover:bg-indigo-100"
            aria-label="Identity document type"
          >
            <option value="aadhaar">Aadhaar</option>
            <option value="birth_cert">Birth Certificate</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-500" />
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          · switching clears the field
        </span>
      </div>

      {/* Row 2: Input */}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode={inputMode}
          maxLength={maxLength}
          value={display}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (typeof onBlur === 'function') onBlur();
          }}
          onChange={(e) => handleChange(e.target.value)}
          required={required}
          placeholder={placeholderForType}
          aria-invalid={!!error}
          aria-describedby={error ? 'identity-error' : undefined}
          className={`w-full rounded-lg border px-3.5 py-2.5 pr-10 text-sm text-slate-900 bg-white placeholder-slate-400 outline-none transition focus:border-indigo-650 focus:ring-1 focus:ring-indigo-600 ${
            error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-slate-200'
          }`}
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? 'Hide identity number' : 'Show identity number'}
          aria-pressed={reveal}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Row 3: counter + helper / error */}
      <div className="flex items-center justify-between gap-3 text-[10px] font-mono">
        <span className="text-slate-400">
          {value.length}/{maxLength}
        </span>
        {error ? (
          <span id="identity-error" className="font-semibold text-red-600 text-right">
            {error}
          </span>
        ) : (
          <span className="text-slate-400 text-right">{helperText || autoHint}</span>
        )}
      </div>
    </div>
  );
};