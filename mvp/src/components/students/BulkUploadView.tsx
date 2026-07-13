import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import axios from 'axios';
import {
  User,
  UserRole,
  ClassGroup,
  Student
} from '../../types';
import { studentAPI } from '../../api/students';
import {
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  UserPlus,
  X,
  Eye,
  EyeOff,
  Search,
  FileText
} from 'lucide-react';

interface BulkUploadViewProps {
  user: User;
  token: string;
}

type RowStatus =
  | 'pending'
  | 'processing'
  | 'inserted'
  | 'failed'
  | 'duplicate'
  | 'cancelled';

interface ParsedRow {
  rowNum: number;        // 1-indexed data row (header is row 1)
  studentName: string;
  dateOfBirth: string;
  gender: string;
  aadhaarNumber: string; // normalized
  parentName: string;
  class: number;
  section: string;
  errors: string[];      // empty when valid
  inFileDuplicate: boolean;
  inDbDuplicate: boolean;
}

interface Summary {
  total: number;
  inserted: number;
  failed: number;
  duplicate: number;
  cancelled: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 1000;
const ALLOWED_EXTS = ['csv', 'xlsx', 'xls'];

const TEMPLATE_CSV = `studentName,dateOfBirth,gender,aadhaarOrBirthCertNo,parentGuardianName,class,section
Aarav Kumar,2017-04-12,Male,123412341234,Sunita Kumar,Class 3,A
Aisha Patel,2016-08-30,Female,987698761234,Ramesh Patel,Class 3,A
Simran Preet,2017-01-22,Female,111122223333,Harvinder Singh,Class 3,A
`;

// === Excel template (proper cell types so Excel preserves data correctly) ===
// Critical: Aadhaar must be text (otherwise Excel converts to scientific notation),
// DOB must be date (formatted yyyy-mm-dd).
function buildXlsxTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const headers = [
    'studentName',
    'dateOfBirth',
    'gender',
    'aadhaarOrBirthCertNo',
    'parentGuardianName',
    'class',
    'section'
  ];
  const examples: (string | number | Date)[][] = [
    ['Aarav Kumar', new Date(2017, 3, 12), 'male', '123412341234', 'Sunita Kumar', 3, 'A'],
    ['Aisha Patel', new Date(2016, 7, 30), 'female', '987698761234', 'Ramesh Patel', 3, 'A'],
    ['Simran Preet', new Date(2017, 0, 22), 'female', '111122223333', 'Harvinder Singh', 3, 'A']
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = [
    { wch: 25 }, // studentName
    { wch: 14 }, // dateOfBirth
    { wch: 10 }, // gender
    { wch: 24 }, // aadhaarOrBirthCertNo
    { wch: 28 }, // parentGuardianName
    { wch: 8 },  // class
    { wch: 10 }  // section
  ];

  // Force Aadhaar (col D) to TEXT — prevents scientific notation in Excel
  for (let r = 2; r <= examples.length + 1; r++) {
    const cellRef = `D${r}`;
    if (ws[cellRef]) {
      ws[cellRef].t = 's';
      ws[cellRef].z = '@';
    }
  }
  // Force DOB (col B) to DATE — keeps ISO yyyy-mm-dd format
  for (let r = 2; r <= examples.length + 1; r++) {
    const cellRef = `B${r}`;
    if (ws[cellRef]) {
      ws[cellRef].t = 'd';
      ws[cellRef].z = 'yyyy-mm-dd';
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Students');

  // Add a second sheet with a Data Format Guide
  const guideRows = [
    ['Column', 'Required Type', 'Format / Example', 'Common Mistakes'],
    ['studentName', 'Text', '"Aarav Kumar"', 'Avoid numbers, special characters (@, #, !)'],
    ['dateOfBirth', 'Date', '2017-04-12 (YYYY-MM-DD)', 'Use Text format yyyy-mm-dd — NOT 12/04/2017 (locale-dependent)'],
    ['gender', 'Text', 'male | female | other', 'Capitalization is auto-normalized — Male/Female OK'],
    ['aadhaarOrBirthCertNo', 'Text (12 digits or 8–25 alphanumeric)', '"123412341234" or "BC2017AM1234"', 'NEVER as Number — Excel shows scientific notation 1.23E+11'],
    ['parentGuardianName', 'Text', '"Sunita Kumar"', 'Same rules as studentName'],
    ['class', 'Number 1–12', '3', 'Use 3, NOT "Class 3" or "3rd"'],
    ['section', 'Text', 'A, B, C, ...', 'Single uppercase letter, must match your assigned class']
  ];
  const guideWs = XLSX.utils.aoa_to_sheet(guideRows);
  guideWs['!cols'] = [
    { wch: 24 }, { wch: 28 }, { wch: 50 }, { wch: 60 }
  ];
  XLSX.utils.book_append_sheet(wb, guideWs, 'Data Format Guide');

  return wb;
}

function downloadXlsxTemplate() {
  const wb = buildXlsxTemplate();
  XLSX.writeFile(wb, 'template_students.xlsx');
}

// === Defensive parsing helpers (recover from common Excel data issues) ===

/** Recover an Aadhaar/BC number from Excel, even if it became scientific notation. */
function recoverAadhaar(raw: any): string {
  if (raw == null) return '';
  // Handle number (Excel stores Aadhaar as number despite text format)
  if (typeof raw === 'number') {
    if (Number.isFinite(raw)) {
      const s = String(Math.trunc(raw));
      if (/^\d{12}$/.test(s)) return s;
      // Handle 1.23457e+11 style scientific notation
      const asFloat = parseFloat(String(raw));
      if (!isNaN(asFloat)) {
        const big = BigInt(Math.trunc(asFloat));
        return big.toString().padStart(12, '0').slice(-12);
      }
    }
    return '';
  }
  let s = String(raw).replace(/\s+/g, '').toUpperCase();
  // Handle string scientific notation like "1.23412E+11"
  if (/^\d+\.\d+E\+?\d+$/.test(s) || /^\d+E\+?\d+$/.test(s)) {
    const n = parseFloat(s);
    if (!isNaN(n) && Number.isFinite(n)) {
      const big = BigInt(Math.trunc(n));
      s = big.toString().padStart(12, '0').slice(-12);
    }
  }
  return s;
}

/** Recover a date string in YYYY-MM-DD form from Excel cell value. */
function recoverDate(raw: any): string {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0];
  }
  if (typeof raw === 'number') {
    // Excel serial date number — convert via SheetJS or fallback
    // Use SheetJS `SSF` if available, otherwise compute
    try {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed) {
        const yyyy = String(parsed.y).padStart(4, '0');
        const mm = String(parsed.m).padStart(2, '0');
        const dd = String(parsed.d).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {
      // fall through
    }
  }
  const s = String(raw).trim();
  // Accept DD/MM/YYYY or MM/DD/YYYY heuristically (assume DD/MM/YYYY if first part > 12)
  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    let [, a, b, y] = slashMatch;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    if (parseInt(a, 10) > 12) {
      // DD/MM/YYYY
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    if (parseInt(b, 10) > 12) {
      // MM/DD/YYYY
      return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }
    // Ambiguous — assume DD/MM/YYYY (Indian convention)
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  return s;
}

const NAME_REGEX = /^[\p{L} .'\-]{2,100}$/u;
const AADHAAR_REGEX = /^\d{12}$/;
const BIRTH_CERT_REGEX = /^[A-Z0-9]{8,25}$/;

const todayIsoDate = () => new Date().toISOString().split('T')[0];

function normalizeHeader(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]/g, '');
}

function parseClassNumber(raw: string): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  const m = String(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function maskAadhaarForReport(raw: string): string {
  if (!raw) return '';
  if (/^\d{12}$/.test(raw)) return 'X'.repeat(8) + raw.slice(-4);
  if (raw.length > 4) return 'X'.repeat(raw.length - 4) + raw.slice(-4);
  return raw;
}

/**
 * Bulk Upload page — Teachers
 *
 * Per Version_1.0.md §6.5 Bulk Registration.
 *
 * Supports CSV and XLSX files. Two-step layout (Template → Upload). Pre-validates
 * every row client-side and pre-checks against the existing roster for duplicates.
 * During upload: per-row status icons, progress bar, cancellable via AbortController.
 * On completion: success summary, failed rows visible, CSV error report downloadable.
 */
export function BulkUploadView({ user, token }: BulkUploadViewProps) {
  const navigate = useNavigate();

  // === Data ===
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [existingStudents, setExistingStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // === File / parsing ===
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  // === Parsed rows + per-row live status ===
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [insertedIds, setInsertedIds] = useState<Record<number, string>>({});

  // === Upload state ===
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [actionError, setActionError] = useState('');

  // === Filter for the result table ===
  const [resultFilter, setResultFilter] = useState<'all' | RowStatus>('all');
  const [resultQuery, setResultQuery] = useState('');

  // === AbortController for in-flight fetches ===
  const abortRef = useRef<AbortController | null>(null);

  // === Initial fetch ===
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clsRes, stdRes] = await Promise.all([
          axios.get('/api/classes', { headers: { Authorization: `Bearer ${token}` } }),
          studentAPI.list(token, { limit: 10000 })
        ]);
        const clsData: ClassGroup[] = clsRes.data ?? [];
        const stdData: Student[] = stdRes.students ?? [];
        if (cancelled) return;
        setClasses(clsData);
        setExistingStudents(stdData);
      } catch (e) {
        setActionError('Failed to load teacher data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // === Re-fetch existing students (always fresh before upload) ===
  async function refreshRoster(): Promise<Student[]> {
    try {
      const res = await studentAPI.list(token, { limit: 10000 });
      if (res.students) {
        const data: Student[] = res.students;
        setExistingStudents(data);
        return data;
      }
    } catch {
      // ignore
    }
    return existingStudents;
  }

  // === Counts (for the pre-upload summary) ===
  const counts = useMemo(() => {
    const valid = rows.filter((r) => r.errors.length === 0 && !r.inFileDuplicate && !r.inDbDuplicate).length;
    const invalid = rows.filter((r) => r.errors.length > 0).length;
    const inFileDup = rows.filter((r) => r.inFileDuplicate).length;
    const inDbDup = rows.filter((r) => r.inDbDuplicate).length;
    return { valid, invalid, inFileDup, inDbDup };
  }, [rows]);

  // === Template download ===
  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_students.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // === File pick ===
  function onFilePicked(f: File | null) {
    setParseError('');
    setSummary(null);
    setRows([]);
    setStatuses({});
    setReasons({});
    setInsertedIds({});
    setResultFilter('all');
    setResultQuery('');

    if (!f) {
      setFile(null);
      return;
    }

    const ext = f.name.toLowerCase().split('.').pop() || '';
    if (!ALLOWED_EXTS.includes(ext)) {
      setParseError('Unsupported file format. Use .csv or .xlsx.');
      setFile(null);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setParseError(`File exceeds the ${(MAX_FILE_SIZE / (1024 * 1024))} MB limit (was ${(f.size / (1024 * 1024)).toFixed(2)} MB).`);
      setFile(null);
      return;
    }

    setFile(f);
    void parseAndValidate(f);
  }

  // === File drop handler ===
  function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer.files?.[0];
    if (f) onFilePicked(f);
  }

  // === Parse the file and validate every row ===
  async function parseAndValidate(f: File) {
    setParsing(true);
    try {
      const ext = f.name.toLowerCase().split('.').pop() || '';
      let workbook: XLSX.WorkBook;

      if (ext === 'csv') {
        const text = await f.text();
        workbook = XLSX.read(text, { type: 'string' });
      } else {
        const buffer = await f.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array' });
      }

      const wsName = workbook.SheetNames[0];
      if (!wsName) throw new Error('No sheets found in the file.');

      const ws = workbook.Sheets[wsName];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        defval: '',
        raw: true,
        cellDates: true
      });

      if (raw.length === 0) throw new Error('File contains no data rows.');
      if (raw.length > MAX_ROWS) {
        throw new Error(`File exceeds ${MAX_ROWS} rows. Limit: ${MAX_ROWS}.`);
      }

      // Build a fresh aadhaar set from the existing roster for duplicate check.
      const existingAadhaars = new Set<string>(
        existingStudents
          .map((s) =>
            String(s.aadhaarNumber || s.aadharMasked || '')
              .replace(/\s+/g, '')
              .toUpperCase()
          )
          .filter(Boolean)
      );

      const parsed = parseRows(raw, existingAadhaars);
      setRows(parsed);
      setStatuses(
        Object.fromEntries(
          parsed.map((r, i) => [
            i,
            r.errors.length > 0
              ? 'failed'
              : r.inFileDuplicate || r.inDbDuplicate
                ? 'duplicate'
                : 'pending'
          ])
        ) as Record<number, RowStatus>
      );
      setReasons({});
      setInsertedIds({});
    } catch (e: any) {
      setParseError(e?.message || 'Failed to parse the file.');
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  // === Parse + validate each row ===
  function parseRows(
    raw: Record<string, any>[],
    existingAadhaars: Set<string>
  ): ParsedRow[] {
    const seenInFile = new Set<string>();

    return raw.map((row, idx) => {
      const lc: Record<string, any> = {};
      for (const k of Object.keys(row)) {
        lc[normalizeHeader(k)] = row[k];
      }

      const studentName = String(lc.studentname || '').trim();
      const dateOfBirth = recoverDate(lc.dateofbirth);
      const gender = String(lc.gender || '').trim().toLowerCase();
      const aadhaarNumber = recoverAadhaar(
        lc.aadhaarorbirthcertno || lc.aadhaarnumber || ''
      );
      const parentName = String(
        lc.parentguardianname || lc.parentname || ''
      ).trim();
      const classRaw = String(lc.class || '').trim();
      const section = String(lc.section || '').trim();
      const klass = parseClassNumber(classRaw);

      const errors: string[] = [];

      if (!studentName) errors.push('Student name is required.');
      else if (studentName.length < 2 || studentName.length > 100)
        errors.push('Student name must be 2–100 characters.');
      else if (!NAME_REGEX.test(studentName))
        errors.push('Student name has invalid characters.');

      if (!dateOfBirth) {
        errors.push('Date of birth is required.');
      } else {
        const dob = new Date(dateOfBirth);
        if (isNaN(dob.getTime())) errors.push('Invalid date of birth format.');
        else if (dob.getTime() > Date.now())
          errors.push('Date of birth must be in the past.');
        else {
          const ageY =
            (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (ageY < 3) errors.push('Student must be at least 3 years old.');
          else if (ageY > 18)
            errors.push('Student must be 18 years old or younger.');
        }
      }

      if (!gender) errors.push('Gender is required.');
      else if (!['male', 'female', 'other'].includes(gender))
        errors.push('Gender must be one of: male, female, other.');

      if (!aadhaarNumber) errors.push('Aadhaar / Birth Certificate number is required.');
      else if (
        !AADHAAR_REGEX.test(aadhaarNumber) &&
        !BIRTH_CERT_REGEX.test(aadhaarNumber)
      )
        errors.push(
          'Aadhaar must be 12 digits, or Birth Certificate 8–25 alphanumeric.'
        );

      if (!parentName) errors.push('Parent / Guardian name is required.');
      else if (parentName.length < 2 || parentName.length > 100)
        errors.push('Parent name must be 2–100 characters.');

      if (!klass || klass < 1 || klass > 12)
        errors.push('Class must be an integer 1–12.');
      if (!section) errors.push('Section is required.');

      // Class / section scope check
      const isAssigned = classes.some(
        (c) => c.className === `Class ${klass}` && c.section === section
      );
      if (!isAssigned && classes.length > 0) {
        errors.push(
          `Class ${klass} - Section ${section} is not in your assignment.`
        );
      }

      // Duplicates
      const inFileDuplicate = aadhaarNumber
        ? seenInFile.has(aadhaarNumber)
        : false;
      if (aadhaarNumber && !inFileDuplicate) {
        seenInFile.add(aadhaarNumber);
      }
      const inDbDuplicate = aadhaarNumber
        ? existingAadhaars.has(aadhaarNumber)
        : false;

      return {
        rowNum: idx + 2, // +1 for 1-indexed, +1 for header
        studentName,
        dateOfBirth,
        gender,
        aadhaarNumber,
        parentName,
        class: klass,
        section,
        errors,
        inFileDuplicate,
        inDbDuplicate
      };
    });
  }

  // === Cancel current upload ===
  function cancelUpload() {
    setCancelled(true);
    abortRef.current?.abort();
  }

  // === Process all rows sequentially ===
  async function processRows() {
    if (rows.length === 0) return;
    setBusy(true);
    setCancelled(false);
    setSummary(null);
    setActionError('');
    setProgress({ current: 0, total: rows.length });

    const controller = new AbortController();
    abortRef.current = controller;

    // Refresh roster for the most up-to-date duplicate check
    const fresh = await refreshRoster();
    const freshAadhaars = new Set<string>(
      fresh
        .map((s) =>
          String(s.aadhaarNumber || s.aadharMasked || '')
            .replace(/\s+/g, '')
            .toUpperCase()
        )
        .filter(Boolean)
    );

    let inserted = 0;
    let failed = 0;
    let duplicate = 0;
    let cancelledCount = 0;

    for (let i = 0; i < rows.length; i++) {
      if (cancelled) {
        // Mark remaining as cancelled
        setStatuses((prev) => {
          const next = { ...prev };
          for (let j = i; j < rows.length; j++) {
            if (!next[j] || next[j] === 'pending') {
              next[j] = 'cancelled';
            }
          }
          return next;
        });
        cancelledCount = rows.length - i;
        break;
      }

      const row = rows[i];

      // Skip validation errors
      if (row.errors.length > 0) {
        setStatuses((prev) => ({ ...prev, [i]: 'failed' }));
        setReasons((prev) => ({ ...prev, [i]: row.errors[0] }));
        failed++;
        setProgress({ current: i + 1, total: rows.length });
        continue;
      }

      // Skip in-DB duplicates (pre-check)
      const dupKey = String(row.aadhaarNumber || '')
        .replace(/\s+/g, '')
        .toUpperCase();
      if (dupKey && freshAadhaars.has(dupKey)) {
        setStatuses((prev) => ({ ...prev, [i]: 'duplicate' }));
        setReasons((prev) => ({
          ...prev,
          [i]: 'Aadhaar already registered in your school'
        }));
        duplicate++;
        setProgress({ current: i + 1, total: rows.length });
        continue;
      }

      // Skip in-file duplicates
      if (row.inFileDuplicate) {
        setStatuses((prev) => ({ ...prev, [i]: 'duplicate' }));
        setReasons((prev) => ({
          ...prev,
          [i]: 'Duplicate Aadhaar within file'
        }));
        duplicate++;
        setProgress({ current: i + 1, total: rows.length });
        continue;
      }

      setStatuses((prev) => ({ ...prev, [i]: 'processing' }));
      setProgress({ current: i + 1, total: rows.length });

      try {
        const data: any = await studentAPI.create(token, {
          studentName: row.studentName,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender as 'male' | 'female' | 'other',
          aadhaarNumber: row.aadhaarNumber,
          parentName: row.parentName,
          class: row.class,
          section: row.section
        });

        setStatuses((prev) => ({ ...prev, [i]: 'inserted' }));
        setReasons((prev) => ({
          ...prev,
          [i]: `studentId ${data.studentId || data.id || data._id || ''}`
        }));
        setInsertedIds((prev) => ({
          ...prev,
          [i]: String(data.studentId || data.id || data._id || '')
        }));
        inserted++;
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
          setStatuses((prev) => ({ ...prev, [i]: 'cancelled' }));
          setReasons((prev) => ({ ...prev, [i]: 'Cancelled by user' }));
          cancelledCount++;
        } else if (
          err?.response?.status === 409 ||
          /duplicate|already/i.test(err?.response?.data?.error || '')
        ) {
          setStatuses((prev) => ({ ...prev, [i]: 'duplicate' }));
          setReasons((prev) => ({
            ...prev,
            [i]: err.response.data.error || 'Duplicate Aadhaar (server)'
          }));
          duplicate++;
        } else {
          setStatuses((prev) => ({ ...prev, [i]: 'failed' }));
          setReasons((prev) => ({
            ...prev,
            [i]: err?.response?.data?.error || `Server error (${err?.response?.status || 'network'})`
          }));
          failed++;
        }
      }
    }

    setProgress({ current: rows.length, total: rows.length });
    setSummary({
      total: rows.length,
      inserted,
      failed,
      duplicate,
      cancelled: cancelledCount
    });
    setBusy(false);
    abortRef.current = null;
  }

  // === Download error report (CSV of failed / duplicate rows) ===
  function downloadErrorReport() {
    if (!summary) return;

    const lines = ['row,name,class,section,aadhaar,status,reason'];
    rows.forEach((row, i) => {
      const status = statuses[i];
      if (status === 'failed' || status === 'duplicate' || status === 'cancelled') {
        const reason = reasons[i] || '';
        const safe = (s: string) => '"' + (s || '').replace(/"/g, '""') + '"';
        lines.push(
          [
            row.rowNum,
            safe(row.studentName),
            `Class ${row.class}`,
            safe(row.section),
            safe(maskAadhaarForReport(row.aadhaarNumber)),
            status,
            safe(reason)
          ].join(',')
        );
      }
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rejected-rows.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // === Result table filter ===
  const resultRows = useMemo(() => {
    return rows
      .map((row, i) => ({ row, idx: i, status: statuses[i] || 'pending', reason: reasons[i] || '' }))
      .filter(({ status }) => resultFilter === 'all' || status === resultFilter)
      .filter(({ row }) => {
        const q = resultQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          (row.studentName || '').toLowerCase().includes(q) ||
          (row.aadhaarNumber || '').toLowerCase().includes(q) ||
          (`Class ${row.class} - ${row.section}`).toLowerCase().includes(q) ||
          String(row.rowNum).includes(q)
        );
      });
  }, [rows, statuses, reasons, resultFilter, resultQuery]);

  // === Render guards ===
  if (user.role !== UserRole.TEACHER && user.role !== UserRole.VOLUNTEER) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4 my-12">
        <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto" />
        <h3 className="font-display font-semibold text-zinc-950 text-base">Access Restricted</h3>
        <p className="text-sm text-zinc-500">Bulk Upload is available to Teachers and Volunteers only.</p>
        <button
          onClick={() => navigate('/workspace')}
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
        <span className="ml-2 text-xs font-mono text-slate-500">Loading teacher data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-indigo-600" />
            Bulk Upload Students
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Upload a <strong className="font-mono">.csv</strong> or{' '}
            <strong className="font-mono">.xlsx</strong> file. All fields must match the
            single-student registration rules.
          </p>
        </div>
        <button
          onClick={() => navigate('/workspace')}
          className="text-xs font-mono font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 self-start"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Classroom
        </button>
      </div>

      {/* Step 1 + Step 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1 */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-display font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
            Step 1 — Download Template
          </h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Download the canonical CSV template. The first row contains the required
            headers; do not change them. <strong>Excel / Numbers users</strong>: save
            your file as <strong className="font-mono">.csv</strong> or{' '}
            <strong className="font-mono">.xlsx</strong> before uploading.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={downloadTemplate}
              className="bg-white border border-zinc-200 hover:border-indigo-200 text-zinc-800 font-mono font-medium text-xs px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              template_students.csv
            </button>
            <button
              onClick={downloadXlsxTemplate}
              className="bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-mono font-semibold text-xs px-4 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"
              title="Recommended — preserves Aadhaar as text and DOB as date in Excel"
            >
              <Download className="h-3.5 w-3.5" />
              template_students.xlsx
            </button>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[10px] font-mono text-slate-600 leading-relaxed break-words">
            <strong className="block text-slate-700 mb-1">Required headers</strong>
            studentName, dateOfBirth, gender, aadhaarOrBirthCertNo,
            parentGuardianName, class, section
          </div>
          <p className="text-[10px] text-zinc-500 italic">
            ℹ Class and section must match your assigned classroom. Other values are
            rejected per row.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-display font-semibold text-zinc-900 border-b border-zinc-100 pb-2">
            Step 2 — Upload
          </h2>

          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={onDrop}
            onClick={() => document.getElementById('bulk-file-input')?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload CSV or XLSX file"
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              parsing
                ? 'border-indigo-300 bg-indigo-50/30'
                : 'border-slate-300 hover:bg-slate-50'
            }`}
          >
            {parsing ? (
              <Loader2 className="mx-auto mb-2 text-indigo-500 animate-spin" size={32} />
            ) : (
              <FileSpreadsheet className="mx-auto mb-2 text-slate-400" size={32} />
            )}
            <p className="text-slate-700 text-sm font-medium">
              {parsing ? 'Parsing file…' : 'Drop file here, or click to browse'}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              .csv, .xlsx, .xls · ≤ {MAX_FILE_SIZE / (1024 * 1024)} MB · ≤ {MAX_ROWS} rows
            </p>
            <input
              id="bulk-file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFilePicked(f);
              }}
            />
            {file && !parsing && (
              <div className="mt-3 text-xs">
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-slate-50 border border-slate-200">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <strong className="text-slate-800 font-mono">{file.name}</strong>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilePicked(null);
                  }}
                  className="ml-2 text-zinc-500 hover:text-rose-600 inline-flex items-center"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {parseError && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-medium">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
              {parseError}
            </div>
          )}

          {/* Pre-upload counts */}
          {file && rows.length > 0 && !summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <CountChip label="Total" value={rows.length} color="slate" />
              <CountChip label="Ready" value={counts.valid} color="emerald" />
              <CountChip label="Invalid" value={counts.invalid} color="rose" />
              <CountChip
                label="Duplicate"
                value={counts.inFileDup + counts.inDbDup}
                color="amber"
              />
            </div>
          )}

          {/* Pre-upload validation table — shows per-row errors before upload */}
          {file && rows.length > 0 && !summary && counts.invalid > 0 && (
            <div className="border border-rose-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-rose-50 text-rose-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-mono font-bold uppercase text-[10px]">#</th>
                      <th className="px-3 py-2 text-left font-mono font-bold uppercase text-[10px]">Name</th>
                      <th className="px-3 py-2 text-left font-mono font-bold uppercase text-[10px]">Class</th>
                      <th className="px-3 py-2 text-left font-mono font-bold uppercase text-[10px]">Status</th>
                      <th className="px-3 py-2 text-left font-mono font-bold uppercase text-[10px]">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {rows.map((row, i) => {
                      const hasError = row.errors.length > 0;
                      if (!hasError && !row.inFileDuplicate && !row.inDbDuplicate) return null;
                      return (
                        <tr key={i} className="hover:bg-rose-50/50">
                          <td className="px-3 py-1.5 font-mono text-zinc-500">{row.rowNum}</td>
                          <td className="px-3 py-1.5 text-zinc-900 font-medium">{row.studentName || '—'}</td>
                          <td className="px-3 py-1.5 text-zinc-700 whitespace-nowrap">
                            Class {row.class} - {row.section}
                          </td>
                          <td className="px-3 py-1.5">
                            <StatusBadge
                              status={hasError ? 'failed' : row.inFileDuplicate || row.inDbDuplicate ? 'duplicate' : 'pending'}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-rose-600 font-mono text-[11px] break-all max-w-xs">
                            {row.errors.length > 0
                              ? row.errors.join('; ')
                              : row.inDbDuplicate
                                ? 'Already registered in database'
                                : 'Duplicate in file'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload / cancel controls */}
          <div className="flex gap-2">
            {!busy ? (
              <button
                onClick={processRows}
                disabled={rows.length === 0 || counts.valid === 0}
                className="flex-1 bg-zinc-900 text-white font-mono font-medium text-xs py-2.5 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                {counts.valid === 0 && rows.length > 0
                  ? `No valid rows to upload (${rows.length} total)`
                  : `Upload ${counts.valid} row${counts.valid === 1 ? '' : 's'}`}
              </button>
            ) : (
              <button
                onClick={cancelUpload}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-mono font-medium text-xs py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
          </div>

          {/* Progress bar (during upload) */}
          {busy && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
                <span>Processing {progress.current} / {progress.total}</span>
                <span>{Math.round((progress.current / Math.max(1, progress.total)) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden" aria-label="Upload progress">
                <div
                  className="h-full bg-indigo-600 transition-all duration-200"
                  style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Format Reference */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h2 className="text-sm font-display font-semibold text-zinc-900">
            Data Format Reference
          </h2>
          <span className="text-[10px] font-mono font-bold uppercase text-zinc-500">
            required for every row
          </span>
        </div>
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <strong className="font-semibold">Class + Section must match your assigned classroom.</strong>{' '}
            Rows whose <span className="font-mono">class</span> + <span className="font-mono">section</span> are NOT in your account's assignment are rejected as <em>invalid</em> (even if all other fields are correct). Change them to one of your assigned classes before uploading.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left border-b border-zinc-200 bg-white text-zinc-500">
                <th className="px-4 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">Column</th>
                <th className="px-4 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">Type</th>
                <th className="px-4 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">Example</th>
                <th className="px-4 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">Common Mistakes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">studentName</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">text</span></td>
                <td className="px-4 py-2 font-mono">Aarav Kumar</td>
                <td className="px-4 py-2 text-zinc-500">Avoid special characters (@ # !). 2–100 chars.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">dateOfBirth</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">date</span></td>
                <td className="px-4 py-2 font-mono">2017-04-12</td>
                <td className="px-4 py-2 text-zinc-500">Use <strong className="font-mono">yyyy-mm-dd</strong>. In Excel, set cell format to <strong className="font-mono">Date yyyy-mm-dd</strong>.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">gender</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">text</span></td>
                <td className="px-4 py-2 font-mono">male / female / other</td>
                <td className="px-4 py-2 text-zinc-500">Capitalization is auto-normalized.</td>
              </tr>
              <tr className="bg-amber-50/40">
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">aadhaarOrBirthCertNo</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-mono">text (⚠ not number)</span></td>
                <td className="px-4 py-2 font-mono">123412341234</td>
                <td className="px-4 py-2 text-zinc-700"><strong className="text-amber-800">NEVER</strong> as a number — Excel will store as <span className="font-mono">1.23E+11</span> and fail validation. In Excel, format the column as <strong className="font-mono">Text</strong> BEFORE typing.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">parentGuardianName</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">text</span></td>
                <td className="px-4 py-2 font-mono">Sunita Kumar</td>
                <td className="px-4 py-2 text-zinc-500">Same rules as studentName.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">class</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">number 1–12</span></td>
                <td className="px-4 py-2 font-mono">3</td>
                <td className="px-4 py-2 text-zinc-500">Use <span className="font-mono">3</span>, NOT <span className="font-mono">"Class 3"</span> or <span className="font-mono">"3rd"</span>. Must be in your assignment.</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono font-semibold text-zinc-900">section</td>
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-zinc-100 rounded font-mono">text</span></td>
                <td className="px-4 py-2 font-mono">A</td>
                <td className="px-4 py-2 text-zinc-500">Single uppercase letter. Must match your assigned class.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/30 text-[11px] text-zinc-600 leading-relaxed">
          <strong className="font-semibold">Tip:</strong> Use the <span className="font-mono">.xlsx</span> template — it sets <strong className="font-mono">Aadhaar</strong> as <strong className="font-mono">Text</strong> and <strong className="font-mono">DOB</strong> as <strong className="font-mono">Date (yyyy-mm-dd)</strong> for you. If you build your own sheet, set the column formats first, <em>then</em> enter data.
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100" role="alert">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {actionError}
        </div>
      )}

      {/* Summary + result table (after upload) */}
      {summary && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-4">
          {/* Summary header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              {summary.failed + summary.duplicate === 0 && summary.inserted > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : summary.inserted === 0 ? (
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              <h2 className="text-sm font-semibold text-zinc-900">
                Bulk upload processed — <strong className="text-emerald-700">{summary.inserted}</strong> inserted
                {summary.duplicate > 0 ? (
                  <>
                    {' '}· <strong className="text-amber-700">{summary.duplicate}</strong> duplicate
                  </>
                ) : null}
                {summary.failed > 0 ? (
                  <>
                    {' '}· <strong className="text-rose-700">{summary.failed}</strong> failed
                  </>
                ) : null}
                {summary.cancelled > 0 ? (
                  <>
                    {' '}· <strong className="text-zinc-500">{summary.cancelled}</strong> cancelled
                  </>
                ) : null}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(summary.failed + summary.duplicate + summary.cancelled) > 0 && (
                <button
                  onClick={downloadErrorReport}
                  className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-mono font-medium text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Download rejected-rows.csv
                </button>
              )}
              <button
                onClick={() => navigate('/registered-students')}
                className="bg-zinc-900 text-white font-mono font-medium text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1"
              >
                <UserPlus className="h-3 w-3" />
                View Roster
              </button>
            </div>
          </div>

          {/* Result toolbar */}
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={resultQuery}
                onChange={(e) => setResultQuery(e.target.value)}
                placeholder="Search within results…"
                className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:border-indigo-500 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider">
              <span className="text-zinc-500 mr-1">Show</span>
              {(['all', 'inserted', 'failed', 'duplicate', 'cancelled'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setResultFilter(f)}
                  className={`px-2 py-1 rounded border transition ${
                    resultFilter === f
                      ? f === 'inserted'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : f === 'failed'
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : f === 'duplicate'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : f === 'cancelled'
                              ? 'bg-slate-100 border-slate-200 text-slate-600'
                              : 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Result table */}
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="min-w-full text-xs font-sans">
              <thead>
                <tr className="text-left border-b border-zinc-200 bg-zinc-50/50 text-zinc-500">
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider w-14">
                    Row
                  </th>
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">
                    Name
                  </th>
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider w-44">
                    Aadhaar
                  </th>
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">
                    Class - Section
                  </th>
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider w-36">
                    Status
                  </th>
                  <th className="px-3 py-2 font-mono font-bold uppercase text-[10px] tracking-wider">
                    Reason / Student ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      No rows match the current filter.
                    </td>
                  </tr>
                ) : (
                  resultRows.map(({ row, idx, status, reason }) => (
                    <tr key={idx} className="border-b border-zinc-100 last:border-b-0">
                      <td className="px-3 py-2 font-mono text-zinc-500">{row.rowNum}</td>
                      <td className="px-3 py-2 text-zinc-900">{row.studentName || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] text-zinc-900 select-all">
                          {maskAadhaarForReport(row.aadhaarNumber) || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-700 whitespace-nowrap">
                        Class {row.class} - {row.section}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-3 py-2 text-zinc-700 font-mono text-[11px] break-all">
                        {reason || (status === 'inserted' ? '' : '—')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] font-mono text-zinc-500">
            Showing {resultRows.length} of {rows.length} rows
          </div>
        </div>
      )}

      {/* Quick links */}
      {summary && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/register-student')}
            className="text-xs font-mono font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register a single student
          </button>
          <button
            onClick={() => navigate('/bulk-upload')}
            className="text-xs font-mono font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Upload another file
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================
// Sub-components
// =============================================================

function CountChip({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: 'slate' | 'emerald' | 'rose' | 'amber';
}) {
  const cls: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700'
  };
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${cls[color]}`}>
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="font-mono font-bold text-base leading-tight">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Pending
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    case 'inserted':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Inserted
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'duplicate':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3" />
          Duplicate
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          <X className="h-3 w-3" />
          Cancelled
        </span>
      );
  }
}
