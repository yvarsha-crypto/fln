import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Loader2, UserCog, School as SchoolIcon } from 'lucide-react';
import { Student, School, ClassGroup } from '../../types';
import { Input } from '../Form';
import { IdentityInput } from './IdentityInput';
import type { IdentityType } from './IdentityInput';
import { RadioGroup } from './RadioGroup';
import { studentAPI } from '../../api/students';

interface StudentEditDrawerProps {
  open: boolean;
  student: Student | null;
  school: School | null;
  activeClass: ClassGroup | null;
  token: string;
  onClose: () => void;
  onSaved: (updated: Student) => void;
}

interface EditErrors {
  studentName?: string;
  dateOfBirth?: string;
  gender?: string;
  aadhaarNumber?: string;
  parentName?: string;
}

const NAME_REGEX = /^[\p{L} .'\-]{2,100}$/u;
const AADHAAR_REGEX = /^\d{12}$/;
const BIRTH_CERT_REGEX = /^[A-Z0-9]{8,25}$/;

const todayIsoDate = () => new Date().toISOString().split('T')[0];

function detectIdentityType(value: string): IdentityType {
  if (!value) return 'aadhaar';
  const norm = value.replace(/\s+/g, '').toUpperCase();
  if (AADHAAR_REGEX.test(norm)) return 'aadhaar';
  return 'birth_cert';
}

type Gender = 'male' | 'female' | 'other';

export const StudentEditDrawer: React.FC<StudentEditDrawerProps> = ({
  open,
  student,
  school,
  activeClass,
  token,
  onClose,
  onSaved
}) => {
  const [form, setForm] = useState({
    studentName: '',
    dateOfBirth: '',
    gender: 'male' as Gender,
    identityType: 'aadhaar' as IdentityType,
    aadhaarNumber: '',
    parentName: ''
  });
  const [errors, setErrors] = useState<EditErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!student) return;
    setForm({
      studentName: student.studentName || student.name || '',
      dateOfBirth: student.dateOfBirth || '',
      gender: (student.gender as Gender) || 'male',
      identityType: detectIdentityType(student.aadhaarNumber || ''),
      aadhaarNumber: student.aadhaarNumber || '',
      parentName: student.parentName || ''
    });
    setErrors({});
    setServerError('');
  }, [student]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open || !student) return null;

  const studentIdDisplay = student.studentId || student.id;
  const classNameDisplay = student.classGroup || (student.class ? `Class ${student.class}` : '\u2014');
  const sectionDisplay = student.section || '\u2014';
  const schoolCodeDisplay = student.schoolCode || school?.id || '\u2014';

  function validate(): EditErrors {
    const e: EditErrors = {};
    const trimmed = form.studentName.trim();
    if (!trimmed) e.studentName = 'Student name is required.';
    else if (trimmed.length < 2 || trimmed.length > 100) e.studentName = 'Student name must be 2-100 characters.';
    else if (!NAME_REGEX.test(trimmed)) e.studentName = 'Letters, spaces, dot, apostrophe, and hyphen only.';

    if (!form.dateOfBirth) {
      e.dateOfBirth = 'Date of birth is required.';
    } else {
      const dob = new Date(form.dateOfBirth);
      if (isNaN(dob.getTime())) e.dateOfBirth = 'Invalid date format.';
      else if (dob.getTime() > Date.now()) e.dateOfBirth = 'Date of birth must be in the past.';
      else {
        const ageY = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (ageY < 3) e.dateOfBirth = 'Student must be at least 3 years old.';
        else if (ageY > 18) e.dateOfBirth = 'Student must be 18 years old or younger.';
      }
    }

    if (!form.gender) e.gender = 'Please select a gender.';

    const norm = form.aadhaarNumber.replace(/\s+/g, '').toUpperCase();
    if (!norm) {
      e.aadhaarNumber = form.identityType === 'aadhaar' ? 'Aadhaar number is required.' : 'Birth Certificate number is required.';
    } else if (form.identityType === 'aadhaar' && !AADHAAR_REGEX.test(norm)) {
      e.aadhaarNumber = 'Aadhaar must be exactly 12 digits.';
    } else if (form.identityType === 'birth_cert' && !BIRTH_CERT_REGEX.test(norm)) {
      e.aadhaarNumber = 'Birth Certificate must be 8-25 alphanumeric characters (A-Z, 0-9).';
    }

    const trimmedParent = form.parentName.trim();
    if (!trimmedParent) e.parentName = 'Parent / Guardian name is required.';
    else if (trimmedParent.length < 2 || trimmedParent.length > 100) e.parentName = 'Parent / Guardian name must be 2-100 characters.';
    else if (!NAME_REGEX.test(trimmedParent)) e.parentName = 'Letters, spaces, dot, apostrophe, and hyphen only.';

    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some((v) => !!v)) return;

    setSubmitting(true);
    setServerError('');

    const payload = {
      studentName: form.studentName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      aadhaarNumber: form.aadhaarNumber.replace(/\s+/g, '').toUpperCase(),
      parentName: form.parentName.trim()
    };

    try {
      const data = await studentAPI.update(token, studentIdDisplay, payload);
      onSaved(data as unknown as Student);
    } catch (err: any) {
      if (err?.response?.data?.error) setServerError(err.response.data.error);
      else setServerError(err?.message || 'Network error. Check connection settings.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9990] flex justify-end bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-drawer-title" onClick={() => !submitting && onClose()}>
      <div className="w-full sm:max-w-lg bg-white border-l border-zinc-200 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-drawer-title" className="text-base font-display font-semibold text-zinc-900 flex items-center gap-2">
              <UserCog className="h-4 w-4 text-indigo-600" />
              Edit Student
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5"><span className="font-mono">{form.studentName || '\u2014'}</span></p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-zinc-400 hover:text-zinc-700 p-1 rounded disabled:opacity-50" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5" noValidate>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              <SchoolIcon className="h-3 w-3" />
              Read-only - cannot be changed
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Student ID</div>
                <div className="font-mono text-zinc-900 select-all break-all">{studentIdDisplay}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">School Code</div>
                <div className="font-mono text-zinc-900">{schoolCodeDisplay}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Class</div>
                <div className="font-semibold text-zinc-900">{classNameDisplay}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400 uppercase">Section</div>
                <div className="font-mono text-zinc-900">{sectionDisplay}</div>
              </div>
              {activeClass && (
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Assigned Teacher</div>
                  <div className="text-zinc-700">Class {activeClass.className} - {activeClass.section} - {school?.name || '\u2014'}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-3 border-b border-zinc-100 pb-1">Editable fields</h3>
            <div className="space-y-4">
              <Input label="Student Name" value={form.studentName} error={errors.studentName} onChange={(e) => setForm((s) => ({ ...s, studentName: e.target.value }))} placeholder="e.g. Aarav Kumar" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Date of Birth" type="date" value={form.dateOfBirth} error={errors.dateOfBirth} max={todayIsoDate()} onChange={(e) => setForm((s) => ({ ...s, dateOfBirth: e.target.value }))} required />
                <RadioGroup label="Gender" name="edit-gender" value={form.gender} options={[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }]} onChange={(v) => setForm((s) => ({ ...s, gender: v as Gender }))} error={errors.gender} required />
              </div>
              <IdentityInput identityType={form.identityType} onTypeChange={(t) => setForm((s) => ({ ...s, identityType: t }))} value={form.aadhaarNumber} error={errors.aadhaarNumber} onChange={(v) => setForm((s) => ({ ...s, aadhaarNumber: v }))} required />
              <Input label="Parent / Guardian Name" value={form.parentName} error={errors.parentName} placeholder="e.g. Sunita Kumar" onChange={(e) => setForm((s) => ({ ...s, parentName: e.target.value }))} required />
            </div>
          </div>

          {serverError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-medium" role="alert">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
              {serverError}
            </div>
          )}
        </form>

        <div className="px-5 py-3 border-t border-zinc-200 flex justify-end gap-2 bg-zinc-50/50">
          <button type="button" onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-xs font-mono font-semibold hover:bg-zinc-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={(e) => submit(e as unknown as React.FormEvent)} disabled={submitting} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-mono font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
