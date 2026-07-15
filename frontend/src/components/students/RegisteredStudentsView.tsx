import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  User,
  UserRole,
  Student,
  ClassGroup,
  School
} from '../../types';
import { StudentEditDrawer } from './StudentEditDrawer';
import { ConfirmModal } from './ConfirmModal';
import { studentAPI } from '../../api/students';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Pencil,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  UserPlus,
  UploadCloud,
  Copy
} from 'lucide-react';

interface RegisteredStudentsViewProps {
  user: User;
  token: string;
  onNavigate?: (view: string) => void;
}

type StatusFilter = 'active' | 'inactive' | 'all';
type SortKey = 'studentName' | 'studentId' | 'dateOfBirth' | 'classSection' | 'parentName' | 'status';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const STATUS_VALUES = ['active', 'inactive'] as const;

function compareValues(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return String(a).localeCompare(String(b));
}

function getStudentId(s: Student): string {
  return s.studentId || s.id || '';
}
function getStudentName(s: Student): string {
  return s.studentName || s.name || '';
}
function getClassSection(s: Student): string {
  const cg = s.classGroup || (s.class != null ? `Class ${s.class}` : '');
  return `${cg} - ${s.section || ''}`;
}

export function RegisteredStudentsView({ user, token, onNavigate }: RegisteredStudentsViewProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeClassId, setActiveClassId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [sortBy, setSortBy] = useState<SortKey>('studentName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState<Student | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [revealedAadhaar, setRevealedAadhaar] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clsRes, stdRes, schRes] = await Promise.all([
          axios.get('/api/classes', { headers: { Authorization: `Bearer ${token}` } }),
          studentAPI.list(token, { limit: 10000 }),
          axios.get('/api/schools', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const clsData: ClassGroup[] = clsRes.data ?? [];
        const stdData: Student[] = stdRes.students ?? [];
        const schData: School[] = schRes.data ?? [];
        if (cancelled) return;
        setClasses(clsData);
        setStudents(stdData);
        setSchools(schData);
        if (clsData.length > 0) setActiveClassId(clsData[0].id);
      } catch (e) {
        setError('Failed to load students.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) || classes[0] || null,
    [classes, activeClassId]
  );
  const activeSchool = useMemo(
    () => (activeClass ? schools.find((s) => s.id === activeClass.schoolId) || null : null),
    [schools, activeClass]
  );

  const classStudents = useMemo(() => {
    if (!activeClass) return students;
    const cn = activeClass.className;
    return students.filter(
      (s) => (s.classGroup === cn || `Class ${s.class}` === cn) && s.section === activeClass.section
    );
  }, [students, activeClass]);

  const matched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classStudents.filter((s) => {
      const status = s.status || 'active';
      if (statusFilter === 'active' && status !== 'active') return false;
      if (statusFilter === 'inactive' && status !== 'inactive') return false;
      if (!q) return true;
      if (getStudentName(s).toLowerCase().includes(q)) return true;
      if (getStudentId(s).toLowerCase().includes(q)) return true;
      if (s.id.toLowerCase().includes(q)) return true;
      if ((s.parentName || '').toLowerCase().includes(q)) return true;
      const aadhaar = s.aadhaarNumber || s.aadharMasked || '';
      if (aadhaar.toLowerCase().includes(q)) return true;
      if (getClassSection(s).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [classStudents, searchQuery, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...matched];
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortBy) {
        case 'studentName': av = getStudentName(a); bv = getStudentName(b); break;
        case 'studentId': av = getStudentId(a); bv = getStudentId(b); break;
        case 'dateOfBirth': av = a.dateOfBirth || ''; bv = b.dateOfBirth || ''; break;
        case 'classSection': av = getClassSection(a); bv = getClassSection(b); break;
        case 'parentName': av = a.parentName || ''; bv = b.parentName || ''; break;
        case 'status': av = a.status || 'active'; bv = b.status || 'active'; break;
      }
      const cmp = compareValues(av, bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [matched, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, activeClassId, sortBy, sortDir, pageSize]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  }

  function toggleAadhaarReveal(sid: string) {
    setRevealedAadhaar((prev) => ({ ...prev, [sid]: !prev[sid] }));
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`Copied: ${text}`);
    } catch { setToast('Copy not supported.'); }
  }

  async function handleDeactivateConfirm(student: Student) {
    setActionError('');
    setActionBusy(true);
    const sid = getStudentId(student);
    try {
      await studentAPI.remove(token, sid);
      setStudents((prev) =>
        prev.map((s) => (getStudentId(s) === sid ? { ...s, status: 'inactive' } : s))
      );
      setConfirmingDeactivate(null);
      setToast(`Deactivated ${getStudentName(student)}.`);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err.message || 'Network error.');
    } finally { setActionBusy(false); }
  }

  async function handleReactivate(student: Student) {
    setActionError('');
    setActionBusy(true);
    const sid = getStudentId(student);
    try {
      await studentAPI.reactivate(token, sid);
      setStudents((prev) =>
        prev.map((s) => (getStudentId(s) === sid ? { ...s, status: 'active' } : s))
      );
      setToast(`Reactivated ${getStudentName(student)}.`);
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err.message || 'Network error.');
    } finally { setActionBusy(false); }
  }

  function handleSaved(updated: Student) {
    setStudents((prev) =>
      prev.map((s) =>
        (getStudentId(s) === (updated.studentId || updated.id)) ? { ...s, ...updated } : s
      )
    );
    setEditingStudent(null);
    setToast(`Saved changes for ${getStudentName(updated)}.`);
  }

  const goBack = () => onNavigate?.('workspace');
  const goRegister = () => onNavigate?.('register_student');
  const goBulk = () => onNavigate?.('bulk_upload');

  if (user.role !== UserRole.TEACHER && user.role !== UserRole.VOLUNTEER) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4 my-12">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />
        <h3 className="font-display font-semibold text-zinc-950 text-base">Access Restricted</h3>
        <p className="text-sm text-zinc-500">The Registered Students view is available to Teachers and Volunteers only.</p>
        <button onClick={goBack} className="px-4 py-2 bg-zinc-950 text-white font-mono font-medium text-xs rounded-lg hover:bg-zinc-850">Back to Workspace</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
        <span className="ml-2 text-xs font-mono text-slate-500">Loading students...</span>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4 my-12">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />
        <h3 className="font-display font-semibold text-zinc-950 text-base">No Class Assigned</h3>
        <p className="text-sm text-zinc-500">You must have at least one registered classroom to view students.</p>
        <button onClick={goBack} className="px-4 py-2 bg-zinc-950 text-white font-mono font-medium text-xs rounded-lg hover:bg-zinc-850">Back to Workspace</button>
      </div>
    );
  }

  const counts = {
    total: classStudents.length,
    active: classStudents.filter((s) => (s.status || 'active') === 'active').length,
    inactive: classStudents.filter((s) => s.status === 'inactive').length
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Registered Students
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Search, edit, and manage your class roster.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={goRegister} className="bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-medium text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Register New Student
          </button>
          <button onClick={goBulk} className="bg-white border border-zinc-200 hover:border-indigo-200 text-zinc-700 font-mono font-medium text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
            <UploadCloud className="h-3.5 w-3.5" />
            Bulk Upload
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-zinc-200 pb-px overflow-x-auto">
        {classes.map((c) => {
          const isActive = activeClassId === c.id;
          const count = students.filter(
            (s) => (s.classGroup === c.className || `Class ${s.class}` === c.className) && s.section === c.section
          ).length;
          return (
            <button key={c.id} onClick={() => setActiveClassId(c.id)}
              className={`px-4 py-2 text-sm font-display font-medium border-b-2 transition-all whitespace-nowrap ${
                isActive ? 'border-zinc-900 text-zinc-900 font-semibold' : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}>
              {c.className} - {c.section}
              <span className="text-[10px] font-mono text-zinc-400 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, student ID, parent, or Aadhaar..."
              className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:border-indigo-500 focus:bg-white"
              aria-label="Search students" />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mr-1">Status</span>
            {STATUS_VALUES.map((opt) => (
              <button key={opt} onClick={() => setStatusFilter(opt)}
                className={`px-3 py-1.5 rounded-md border text-xs font-mono font-semibold uppercase tracking-wider transition ${
                  statusFilter === opt
                    ? opt === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}>{opt}</button>
            ))}
            <button onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md border text-xs font-mono font-semibold uppercase tracking-wider transition ${
                statusFilter === 'all' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}>All</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-mono text-zinc-500">
          <span><strong className="text-zinc-900">{counts.total}</strong> total in class</span>
          <span className="text-emerald-700"><strong>{counts.active}</strong> active</span>
          <span className="text-rose-700"><strong>{counts.inactive}</strong> inactive</span>
          {(searchQuery || statusFilter !== 'active') && (
            <span><strong className="text-zinc-900">{sorted.length}</strong> after filter</span>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100" role="alert">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {actionError}
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs font-sans">
            <thead>
              <tr className="text-left border-b border-zinc-200 bg-zinc-50/50 text-zinc-500">
                <SortableHeader label="Student ID" sortKey="studentId" current={sortBy} dir={sortDir} onClick={toggleSort} className="font-mono w-44" />
                <SortableHeader label="Name" sortKey="studentName" current={sortBy} dir={sortDir} onClick={toggleSort} className="min-w-[160px]" />
                <SortableHeader label="Class - Section" sortKey="classSection" current={sortBy} dir={sortDir} onClick={toggleSort} />
                <SortableHeader label="DOB" sortKey="dateOfBirth" current={sortBy} dir={sortDir} onClick={toggleSort} className="w-32" />
                <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider w-48">Aadhaar</th>
                <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">Parent</th>
                <SortableHeader label="Status" sortKey="status" current={sortBy} dir={sortDir} onClick={toggleSort} className="w-28" />
                <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center">
                    <div className="space-y-3">
                      <Users className="h-10 w-10 text-slate-300 mx-auto" />
                      <p className="text-sm text-zinc-500">
                        {searchQuery || statusFilter !== 'active' ? 'No students match the current filters.' : 'No students registered in this class yet.'}
                      </p>
                      <div className="flex justify-center gap-2">
                        <button onClick={goRegister} className="bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-medium text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" />
                          Register First Student
                        </button>
                        <button onClick={goBulk} className="bg-white border border-zinc-200 hover:border-indigo-200 text-zinc-700 font-mono font-medium text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
                          <UploadCloud className="h-3.5 w-3.5" />
                          Bulk Upload
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((s) => {
                  const sid = getStudentId(s);
                  const aadhaar = s.aadhaarNumber || s.aadharMasked || '';
                  const aadhaarDigits = aadhaar.replace(/[^0-9]/g, '');
                  const aadhaarRevealed = !!revealedAadhaar[sid];
                  let aadhaarDisplay = aadhaar;
                  if (aadhaar && !aadhaarRevealed) {
                    if (/^\d{12}$/.test(aadhaar)) aadhaarDisplay = 'X'.repeat(8) + aadhaar.slice(-4);
                    else if (aadhaar.length > 4) aadhaarDisplay = 'X'.repeat(aadhaar.length - 4) + aadhaar.slice(-4);
                  }
                  const status = s.status || 'active';
                  return (
                    <tr key={sid || Math.random()} className="border-b border-zinc-100 last:border-b-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[11px] text-zinc-900 select-all truncate max-w-[10rem]" title={sid}>
                            {sid ? `${sid.slice(0, 8)}...${sid.slice(-6)}` : '\u2014'}
                          </span>
                          {sid && (
                            <button onClick={() => copyToClipboard(sid)} className="text-zinc-400 hover:text-indigo-600 p-0.5" aria-label="Copy student ID" title="Copy student ID">
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-zinc-900">{getStudentName(s) || '\u2014'}</div>
                        {s.gender && <div className="text-[10px] font-mono text-zinc-400 capitalize">{s.gender}</div>}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 whitespace-nowrap">{getClassSection(s)}</td>
                      <td className="px-3 py-2 font-mono text-zinc-700 whitespace-nowrap">{s.dateOfBirth || (s.age != null ? `~${s.age}y` : '\u2014')}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-zinc-900 select-all">{aadhaarDisplay || '\u2014'}</span>
                          {aadhaar && aadhaar.length > 4 && (
                            <button onClick={() => toggleAadhaarReveal(sid)} className="text-zinc-400 hover:text-slate-700" aria-label={aadhaarRevealed ? 'Hide Aadhaar' : 'Reveal Aadhaar'}>
                              {aadhaarRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                        {aadhaarDigits && aadhaarDigits.length >= 4 && !aadhaarRevealed && (
                          <div className="text-[10px] font-mono text-zinc-400 mt-0.5">last 4: {aadhaarDigits.slice(-4)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{s.parentName || '\u2014'}</td>
                      <td className="px-3 py-2"><StatusBadge status={status} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditingStudent(s)} className="text-zinc-500 hover:text-indigo-600 p-1" aria-label={`Edit ${getStudentName(s)}`} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {status === 'active' ? (
                            <button onClick={() => setConfirmingDeactivate(s)} disabled={actionBusy} className="text-zinc-500 hover:text-rose-600 p-1 disabled:opacity-50" aria-label={`Deactivate ${getStudentName(s)}`} title="Deactivate">
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button onClick={() => handleReactivate(s)} disabled={actionBusy} className="text-zinc-500 hover:text-emerald-600 p-1 disabled:opacity-50" aria-label={`Reactivate ${getStudentName(s)}`} title="Reactivate">
                              <UserCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {paginated.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 border-t border-zinc-200 bg-zinc-50/30">
            <div className="text-[11px] font-mono text-zinc-500">
              Showing <strong className="text-zinc-900">{(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, sorted.length)}</strong> of <strong className="text-zinc-900">{sorted.length}</strong>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Rows</label>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 border border-slate-200 rounded text-xs bg-white" aria-label="Rows per page">
                {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
              <span className="text-[10px] font-mono text-zinc-500 mx-2">Page {safePage} of {totalPages}</span>
              <div className="inline-flex border border-zinc-200 rounded-lg overflow-hidden">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 border-r border-zinc-200" aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2 py-1 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50" aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <button onClick={goBack} className="text-xs font-mono font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Classroom
        </button>
      </div>

      <StudentEditDrawer
        open={!!editingStudent}
        student={editingStudent}
        school={activeSchool}
        activeClass={activeClass}
        token={token}
        onClose={() => setEditingStudent(null)}
        onSaved={handleSaved}
      />

      <ConfirmModal
        open={!!confirmingDeactivate}
        title="Deactivate student?"
        description={confirmingDeactivate ? (
          <div className="space-y-2">
            <p>Deactivating <strong>{getStudentName(confirmingDeactivate)}</strong> will hide them from the active roster. You can reactivate them at any time.</p>
            <p className="text-xs text-zinc-500">Type the student's full name to confirm.</p>
          </div>
        ) : null}
        confirmWord={confirmingDeactivate ? getStudentName(confirmingDeactivate) : ''}
        confirmLabel="Deactivate"
        cancelLabel="Keep Active"
        destructive
        busy={actionBusy}
        onConfirm={() => confirmingDeactivate && handleDeactivateConfirm(confirmingDeactivate)}
        onCancel={() => setConfirmingDeactivate(null)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[10000] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-slate-800" role="status" aria-live="polite">
          <span className="font-mono">{toast}</span>
        </div>
      )}
    </div>
  );
}

function SortableHeader({ label, sortKey, current, dir, onClick, className = '' }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void; className?: string;
}) {
  const isActive = current === sortKey;
  return (
    <th className={`px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider ${className}`}>
      <button type="button" onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-zinc-900 ${isActive ? 'text-zinc-900' : 'text-zinc-500'}`}>
        <span>{label}</span>
        {isActive ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>;
  if (status === 'inactive') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">Inactive</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">{status}</span>;
}
