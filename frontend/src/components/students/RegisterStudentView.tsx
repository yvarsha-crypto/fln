import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { User, UserRole, ClassGroup, School, Student } from '../../types';
import { Input, Select } from '../Form';
import { IdentityInput } from './IdentityInput';
import type { IdentityType } from './IdentityInput';
import { RadioGroup } from './RadioGroup';
import { GeoConfirmCard } from './GeoConfirmCard';
import { SuccessBanner } from './SuccessBanner';
import { studentAPI } from '../../api/students';
import {
  UserPlus,
  ChevronLeft,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface RegisterStudentViewProps {
  user: User;
  token: string;
  onNavigate?: (view: string) => void;
}

interface FormErrors {
  studentName?: string;
  dateOfBirth?: string;
  gender?: string;
  aadhaarNumber?: string;
  parentName?: string;
  class?: string;
}

type Gender = 'male' | 'female' | 'other';

const NAME_REGEX = /^[\p{L} .'\-]{2,100}$/u;
const AADHAAR_REGEX = /^\d{12}$/;
const BIRTH_CERT_REGEX = /^[A-Z0-9]{8,25}$/;

const todayIsoDate = () => new Date().toISOString().split('T')[0];

const computeAgeYears = (dobIso: string): number => {
  const dob = new Date(dobIso);
  if (isNaN(dob.getTime())) return -1;
  return (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
};

const validClassName = (k: number) => `Class ${k}`;

export function RegisterStudentView({ user, token, onNavigate }: RegisterStudentViewProps) {
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdStudent, setCreatedStudent] = useState<Student | null>(null);

  const [form, setForm] = useState({
    studentName: '',
    dateOfBirth: '',
    gender: 'male' as Gender,
    identityType: 'aadhaar' as IdentityType,
    aadhaarNumber: '',
    parentName: '',
    classId: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormErrors, boolean>>({
    studentName: false,
    dateOfBirth: false,
    gender: false,
    aadhaarNumber: false,
    parentName: false,
    class: false
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clsRes, schRes] = await Promise.all([
          axios.get('/api/classes', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const clsData: ClassGroup[] = clsRes.data ?? [];
        const schData: School[] = schRes.data ?? [];
        if (cancelled) return;
        setClasses(clsData);
        const mySchoolId = user.schoolId || user.assignedSchools?.[0] || '';
        const mySchool = schData.find((s) => s.id === mySchoolId) || null;
        setSchool(mySchool);
        if (clsData.length > 0) {
          setForm((prev) => ({ ...prev, classId: clsData[0].id }));
        }
      } catch (e) {
        setError('Failed to load teacher assignments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user.schoolId, user.assignedSchools]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === form.classId) || classes[0] || null,
    [classes, form.classId]
  );

  useEffect(() => {
    const e = validate(form, activeClass);
    setErrors(e);
  }, [form.studentName, form.dateOfBirth, form.gender, form.identityType, form.aadhaarNumber, form.parentName, activeClass]);

  function validate(f: typeof form, ac: ClassGroup | null): FormErrors {
    const e: FormErrors = {};

    const trimmedName = f.studentName.trim();
    if (!trimmedName) {
      e.studentName = 'Student name is required.';
    } else if (trimmedName.length < 2 || trimmedName.length > 100) {
      e.studentName = 'Student name must be 2-100 characters.';
    } else if (!NAME_REGEX.test(trimmedName)) {
      e.studentName = 'Letters, spaces, dot, apostrophe, and hyphen only.';
    }

    if (!f.dateOfBirth) {
      e.dateOfBirth = 'Date of birth is required.';
    } else {
      const dob = new Date(f.dateOfBirth);
      if (isNaN(dob.getTime())) {
        e.dateOfBirth = 'Invalid date format.';
      } else if (dob.getTime() > Date.now()) {
        e.dateOfBirth = 'Date of birth must be in the past.';
      } else {
        const ageY = computeAgeYears(f.dateOfBirth);
        if (ageY < 3) e.dateOfBirth = 'Student must be at least 3 years old.';
        else if (ageY > 18) e.dateOfBirth = 'Student must be 18 years old or younger.';
      }
    }

    if (!f.gender) {
      e.gender = 'Please select a gender.';
    }

    const normAadhaar = f.aadhaarNumber.replace(/\s+/g, '').toUpperCase();
    if (!normAadhaar) {
      e.aadhaarNumber =
        f.identityType === 'aadhaar'
          ? 'Aadhaar number is required.'
          : 'Birth Certificate number is required.';
    } else if (f.identityType === 'aadhaar' && !AADHAAR_REGEX.test(normAadhaar)) {
      e.aadhaarNumber = 'Aadhaar must be exactly 12 digits.';
    } else if (f.identityType === 'birth_cert' && !BIRTH_CERT_REGEX.test(normAadhaar)) {
      e.aadhaarNumber = 'Birth Certificate must be 8-25 alphanumeric characters (A-Z, 0-9).';
    }

    const trimmedParent = f.parentName.trim();
    if (!trimmedParent) {
      e.parentName = 'Parent / Guardian name is required.';
    } else if (trimmedParent.length < 2 || trimmedParent.length > 100) {
      e.parentName = 'Parent / Guardian name must be 2-100 characters.';
    } else if (!NAME_REGEX.test(trimmedParent)) {
      e.parentName = 'Letters, spaces, dot, apostrophe, and hyphen only.';
    }

    if (!ac) {
      e.class = 'No class assigned to your account. Contact your School Principal.';
    }

    return e;
  }

  const hasErrors = (e: FormErrors) => Object.values(e).some((v) => !!v);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched({
      studentName: true,
      dateOfBirth: true,
      gender: true,
      aadhaarNumber: true,
      parentName: true,
      class: true
    });

    const e = validate(form, activeClass);
    setErrors(e);
    if (hasErrors(e) || !activeClass) return;

    const classMatch = activeClass.className.match(/\d+/);
    const klass = classMatch ? parseInt(classMatch[0], 10) : 0;
    const normAadhaar = form.aadhaarNumber.replace(/\s+/g, '').toUpperCase();

    setSubmitting(true);
    setError('');
    try {
      const data = await studentAPI.create(token, {
        studentName: form.studentName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        aadhaarNumber: normAadhaar,
        parentName: form.parentName.trim(),
        class: klass,
        section: activeClass.section
      });
      setCreatedStudent(data as unknown as Student);
      setForm({
        studentName: '',
        dateOfBirth: '',
        gender: 'male',
        identityType: form.identityType,
        aadhaarNumber: '',
        parentName: '',
        classId: form.classId
      });
      setTouched({
        studentName: false,
        dateOfBirth: false,
        gender: false,
        aadhaarNumber: false,
        parentName: false,
        class: false
      });
    } catch (err: any) {
      if (err?.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(err?.message || 'Network error. Check connection settings.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function downloadReceipt() {
    if (!createdStudent) return;
    const s = createdStudent;
    const lines = [
      'Field,Value',
      `studentId,${s.studentId || s.id}`,
      `name,${s.studentName || s.name}`,
      `class,${s.classGroup || (s.class ? validClassName(s.class) : '')}`,
      `section,${s.section}`,
      `dateOfBirth,${s.dateOfBirth || ''}`,
      `gender,${s.gender || ''}`,
      `parentName,${s.parentName || ''}`,
      `aadhaarNumber,${s.aadhaarNumber || ''}`,
      `schoolCode,${s.schoolCode || ''}`,
      `createdAt,${s.createdAt || ''}`
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-${s.studentId || s.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const goBack = () => onNavigate?.('workspace');
  const goToStudents = () => onNavigate?.('registered_students');

  if (user.role !== UserRole.TEACHER && user.role !== UserRole.VOLUNTEER) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4 my-12">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />
        <h3 className="font-display font-semibold text-zinc-950 text-base">Access Restricted</h3>
        <p className="text-sm text-zinc-500">
          The Register Student dashboard is available to Teachers and Volunteers only.
        </p>
        <button
          onClick={goBack}
          className="px-4 py-2 bg-zinc-950 text-white font-mono font-medium text-xs rounded-lg hover:bg-zinc-850"
        >
          Back to Workspace
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
        <span className="ml-2 text-xs font-mono text-slate-500">Loading class assignments...</span>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4 my-12">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />
        <h3 className="font-display font-semibold text-zinc-950 text-base">No Class Assigned</h3>
        <p className="text-sm text-zinc-500">
          You must have at least one registered classroom to add students. Contact your
          School Principal.
        </p>
        <button
          onClick={goBack}
          className="px-4 py-2 bg-zinc-950 text-white font-mono font-medium text-xs rounded-lg hover:bg-zinc-850"
        >
          Back to Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-indigo-600" />
            Register Student
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Onboard a single student into your class. All fields marked <span className="text-rose-600">*</span> are required.
          </p>
        </div>
        <button
          onClick={goBack}
          className="text-xs font-mono font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 self-start"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Classroom
        </button>
      </div>

      {createdStudent && (
        <SuccessBanner
          studentId={createdStudent.studentId || createdStudent.id}
          studentName={createdStudent.studentName || createdStudent.name}
          className={createdStudent.classGroup || (createdStudent.class ? validClassName(createdStudent.class) : '')}
          section={createdStudent.section}
          schoolName={school?.name}
          aadhaarNumber={createdStudent.aadhaarNumber}
          dateOfBirth={createdStudent.dateOfBirth}
          gender={createdStudent.gender}
          parentName={createdStudent.parentName}
          onRegisterAnother={() => setCreatedStudent(null)}
          onViewMyStudents={goToStudents}
          onDownloadCSV={downloadReceipt}
        />
      )}

      {error && !createdStudent && (
        <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-medium" role="alert">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={submit}
          className="lg:col-span-2 bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5"
          noValidate
        >
          <h2 className="text-sm font-display font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
            Student Information
          </h2>

          <Input
            label="Student Name"
            value={form.studentName}
            error={touched.studentName ? errors.studentName : undefined}
            placeholder="e.g. Aarav Kumar"
            onChange={(e) => setForm((s) => ({ ...s, studentName: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, studentName: true }))}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date of Birth"
              type="date"
              value={form.dateOfBirth}
              error={touched.dateOfBirth ? errors.dateOfBirth : undefined}
              max={todayIsoDate()}
              onChange={(e) => setForm((s) => ({ ...s, dateOfBirth: e.target.value }))}
              onBlur={() => setTouched((t) => ({ ...t, dateOfBirth: true }))}
              helperText="Must be in the past. Age 3-18."
              required
            />
            <RadioGroup
              label="Gender"
              name="gender"
              value={form.gender}
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
                { label: 'Other', value: 'other' }
              ]}
              onChange={(v) => {
                setForm((s) => ({ ...s, gender: v as Gender }));
                setTouched((t) => ({ ...t, gender: true }));
              }}
              error={touched.gender ? errors.gender : undefined}
              required
            />
          </div>

          <IdentityInput
            identityType={form.identityType}
            onTypeChange={(t) => setForm((s) => ({ ...s, identityType: t }))}
            value={form.aadhaarNumber}
            error={touched.aadhaarNumber ? errors.aadhaarNumber : undefined}
            onChange={(v) => setForm((s) => ({ ...s, aadhaarNumber: v }))}
            onBlur={() => setTouched((t) => ({ ...t, aadhaarNumber: true }))}
            required
          />

          <Input
            label="Parent / Guardian Name"
            value={form.parentName}
            error={touched.parentName ? errors.parentName : undefined}
            placeholder="e.g. Sunita Kumar"
            onChange={(e) => setForm((s) => ({ ...s, parentName: e.target.value }))}
            onBlur={() => setTouched((t) => ({ ...t, parentName: true }))}
            required
          />

          <div className="border-t border-zinc-100 pt-4">
            <h3 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-3">
              Class &amp; Section (auto-filled from your account)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Class"
                value={form.classId}
                error={touched.class ? errors.class : undefined}
                options={classes.map((c) => ({
                  label: `${c.className} - ${c.section}`,
                  value: c.id
                }))}
                onChange={(e) => {
                  setForm((s) => ({ ...s, classId: e.target.value }));
                  setTouched((t) => ({ ...t, class: true }));
                }}
                required
              />
              <div className="space-y-1.5 w-full">
                <label className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  Section
                </label>
                <div className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 flex items-center gap-2">
                  <span className="font-mono font-semibold">{activeClass?.section || '\u2014'}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">auto-filled</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 block">
                  Auto-filled from your class assignment
                </span>
              </div>
            </div>
          </div>

          <input type="hidden" value={school?.id || ''} readOnly />

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={goBack}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-xs font-mono font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-zinc-900 text-white text-xs font-mono font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? 'Saving...' : 'Register'}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <GeoConfirmCard school={school} activeClass={activeClass} />

          <button
            type="button"
            onClick={() => onNavigate?.('bulk_upload')}
            className="block w-full text-left bg-white border border-zinc-200 hover:border-indigo-200 rounded-xl p-4 shadow-sm transition"
          >
            <div className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Bulk Upload
            </div>
            <div className="text-sm font-semibold text-zinc-900">Upload many students via CSV / XLSX</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Use the canonical template. Class and section must match your assignment.
            </div>
          </button>

          <button
            type="button"
            onClick={goToStudents}
            className="block w-full text-left bg-white border border-zinc-200 hover:border-indigo-200 rounded-xl p-4 shadow-sm transition"
          >
            <div className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Registered Students
            </div>
            <div className="text-sm font-semibold text-zinc-900">View, search the class roster</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              See your full class list with masked Aadhaar.
            </div>
          </button>
        </aside>
      </div>
    </div>
  );
}
