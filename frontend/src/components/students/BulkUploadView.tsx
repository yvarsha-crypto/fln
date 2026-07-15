import React, { useState, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle, X, Download, Loader2, FileSpreadsheet, Info } from 'lucide-react';
import { School, ClassGroup } from '../../types';
import { studentAPI } from '../../api/students';
import * as XLSX from 'xlsx';

interface BulkUploadViewProps {
  school: School | null;
  activeClass: ClassGroup | null;
  token: string;
  onBack: () => void;
}

interface UploadRowResult {
  row: number;
  studentName: string;
  status: 'success' | 'error';
  message: string;
  errors?: string[];
}

interface UploadResult {
  total: number;
  success: number;
  errors: number;
  details: UploadRowResult[];
}

interface PreviewRow {
  name: string;
  dob: string;
  gender: string;
  aadhaar: string;
  parent: string;
  classGroup: string;
  section: string;
}

const EXPECTED_HEADERS = ['StudentName', 'DateOfBirth', 'Gender', 'AadhaarNumber', 'ParentName', 'Class', 'Section'];

function getRowErrors(row: PreviewRow, idx: number): string[] {
  const errs: string[] = [];
  if (!row.name?.trim()) errs.push('StudentName is missing');
  if (row.dob?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.dob.trim())) errs.push('DateOfBirth must be YYYY-MM-DD format');
  if (row.gender?.trim() && !['male', 'female', 'other'].includes(row.gender.trim().toLowerCase())) errs.push('Gender must be male, female, or other');
  if (row.aadhaar?.trim() && !/^\d{12}$/.test(row.aadhaar.trim())) errs.push('AadhaarNumber must be exactly 12 digits');
  if (!row.classGroup?.trim()) errs.push('Class is missing (e.g. 2, 3, 4)');
  if (!row.section?.trim()) errs.push('Section is missing (e.g. A, B)');
  return errs;
}

export const BulkUploadView: React.FC<BulkUploadViewProps> = ({ school, activeClass, token, onBack }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  const hasClass = !!activeClass;
  const schoolCode = school?.id || '';
  const classNameDisplay = activeClass ? `Class ${activeClass.className} - ${activeClass.section}` : '\u2014';

  function reset() {
    setFileName('');
    setPreviewRows([]);
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function parseWorkbook(data: ArrayBuffer): PreviewRow[] {
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
    if (json.length === 0) return [];
    return json.map((r: any) => ({
      name: String(r.StudentName ?? r.studentName ?? '').trim(),
      dob: String(r.DateOfBirth ?? r.dateOfBirth ?? '').trim(),
      gender: String(r.Gender ?? r.gender ?? '').trim(),
      aadhaar: String(r.AadhaarNumber ?? r.aadhaarNumber ?? '').trim(),
      parent: String(r.ParentName ?? r.parentName ?? '').trim(),
      classGroup: String(r.Class ?? r.class ?? r.classGroup ?? '').trim(),
      section: String(r.Section ?? r.section ?? '').trim()
    }));
  }

  function parseCSV(text: string): PreviewRow[] {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const vals = line.split(',').map(v => v.trim());
      return {
        name: vals[header.indexOf('studentname')] ?? '',
        dob: vals[header.indexOf('dateofbirth')] ?? '',
        gender: vals[header.indexOf('gender')] ?? '',
        aadhaar: vals[header.indexOf('aadhaarnumber')] ?? '',
        parent: vals[header.indexOf('parentname')] ?? '',
        classGroup: vals[header.indexOf('class')] ?? '',
        section: vals[header.indexOf('section')] ?? ''
      };
    });
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      setError('Only .csv or .xlsx files are accepted.');
      return;
    }
    setError('');
    setFileName(file.name);
    setResult(null);

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        setPreviewRows(rows);
      };
      reader.onerror = () => setError('Failed to read file.');
      reader.readAsText(file, 'UTF-8');
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as ArrayBuffer;
        try {
          const rows = parseWorkbook(data);
          setPreviewRows(rows);
        } catch {
          setError('Failed to parse XLSX file. Ensure it is a valid Excel workbook.');
        }
      };
      reader.onerror = () => setError('Failed to read file.');
      reader.readAsArrayBuffer(file);
    }
  }

  async function handleUpload() {
    if (previewRows.length === 0) return;
    setSubmitting(true);
    setError('');

    const details: UploadRowResult[] = [];
    let success = 0;
    let errs = 0;

    for (let i = 0; i < previewRows.length; i++) {
      const r = previewRows[i];
      const rowNum = i + 2;
      const fieldErrors = getRowErrors(r, i);

      if (fieldErrors.length > 0) {
        errs++;
        details.push({
          row: rowNum,
          studentName: r.name || '(no name)',
          status: 'error',
          message: fieldErrors.join('; '),
          errors: fieldErrors
        });
        continue;
      }

      try {
        const classGroup = r.classGroup || (activeClass?.className || '');
        const section = r.section || (activeClass?.section || '');
        const payload: any = {
          studentName: r.name,
          dateOfBirth: r.dob || undefined,
          gender: r.gender?.toLowerCase() || 'male',
          schoolCode,
          classGroup: `${classGroup}-${section}`
        };
        if (r.aadhaar) payload.aadhaarNumber = r.aadhaar;
        if (r.parent) payload.parentName = r.parent;

        const data = await studentAPI.create(token, payload);
        success++;
        details.push({ row: rowNum, studentName: r.name, status: 'success', message: `Created as ${data.id || 'ok'}` });
      } catch (e: any) {
        errs++;
        const apiMsg = e?.response?.data?.error || e?.message || 'API error';
        details.push({ row: rowNum, studentName: r.name, status: 'error', message: apiMsg });
      }
    }

    setResult({ total: previewRows.length, success, errors: errs, details });
    setSubmitting(false);
  }

  function downloadSample() {
    const ws = XLSX.utils.aoa_to_sheet([
      EXPECTED_HEADERS,
      ['Aarav Kumar', '2016-05-12', 'male', '123456789012', 'Sunita Kumar', '2', 'A'],
      ['Ananya Sharma', '2017-08-21', 'female', '987654321098', 'Rajesh Sharma', '3', 'B']
    ]);
    ws['!cols'] = EXPECTED_HEADERS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_students.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-display font-semibold text-zinc-900 flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-600" />
            Bulk Upload Students
          </h2>
          <p className="text-xs text-zinc-500">Upload multiple students via XLSX or CSV file (max 100 rows)</p>
        </div>
        <button onClick={onBack} className="text-xs font-mono text-indigo-600 hover:text-indigo-800 hover:underline">Back</button>
      </div>

      {!hasClass && (
        <div className="p-3 text-xs bg-amber-50 text-amber-800 rounded-lg border border-amber-100 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" />
          No class selected. Each row must provide Class and Section values.
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            Target: <span className="font-semibold text-zinc-700">{schoolCode || 'No school'}</span> / <span className="font-semibold text-zinc-700">{classNameDisplay}</span>
          </div>
          <button onClick={downloadSample} className="text-[10px] font-mono font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
            <Download className="h-3 w-3" />
            Sample XLSX
          </button>
        </div>

        {!result ? (
          <div className="p-5">
            {!fileName ? (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                <p className="text-xs font-semibold text-zinc-700">Drop XLSX/CSV file here or click to select</p>
                <p className="text-[10px] text-zinc-400 mt-1">Headers: StudentName, DateOfBirth, Gender, AadhaarNumber, ParentName, Class, Section</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span className="font-semibold">{fileName} <span className="font-mono font-normal text-zinc-400">({previewRows.length} students)</span></span>
                  <button onClick={reset} className="text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 text-[10px] font-mono">
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>

                {previewRows.length > 0 && (
                  <div className="max-h-60 overflow-y-auto border border-zinc-200 rounded-lg">
                    <table className="w-full text-[10px] font-mono">
                      <thead className="bg-zinc-100 text-zinc-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5">#</th>
                          <th className="text-left px-2 py-1.5">Name</th>
                          <th className="text-left px-2 py-1.5">DOB</th>
                          <th className="text-left px-2 py-1.5">Gender</th>
                          <th className="text-left px-2 py-1.5">Aadhaar</th>
                          <th className="text-left px-2 py-1.5">Parent</th>
                          <th className="text-left px-2 py-1.5">Class</th>
                          <th className="text-left px-2 py-1.5">Section</th>
                          <th className="text-left px-2 py-1.5">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 100).map((r, i) => {
                          const issues = getRowErrors(r, i);
                          return (
                            <tr key={i} className={`border-t border-zinc-100 hover:bg-zinc-50 ${issues.length > 0 ? 'bg-rose-50/40' : ''}`}>
                              <td className="px-2 py-1 text-zinc-400">{i + 2}</td>
                              <td className="px-2 py-1">{r.name || <span className="text-rose-400">(missing)</span>}</td>
                              <td className="px-2 py-1">{r.dob || '\u2014'}</td>
                              <td className="px-2 py-1">{r.gender || '\u2014'}</td>
                              <td className="px-2 py-1 max-w-[80px] truncate">{r.aadhaar || '\u2014'}</td>
                              <td className="px-2 py-1">{r.parent || '\u2014'}</td>
                              <td className="px-2 py-1">{r.classGroup || <span className="text-rose-400">(missing)</span>}</td>
                              <td className="px-2 py-1">{r.section || <span className="text-rose-400">(missing)</span>}</td>
                              <td className="px-2 py-1">
                                {issues.length > 0 ? (
                                  <span className="text-rose-600 font-semibold" title={issues.join('\n')}>
                                    {issues.length} issue{issues.length > 1 ? 's' : ''}
                                  </span>
                                ) : (
                                  <span className="text-emerald-500">\u2713</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={submitting || previewRows.length === 0}
                  className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-mono font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {submitting ? `Uploading ${previewRows.length} student(s)...` : `Upload ${previewRows.length} Student(s)`}
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2">
              {result.errors === 0 ? (
                <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-semibold text-zinc-900">
                  Upload {result.errors === 0 ? 'completed successfully' : 'completed with errors'}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {result.success} succeeded, {result.errors} failed out of {result.total}
                </p>
              </div>
            </div>

            {result.details.some((d) => d.status === 'error') && (
              <div className="max-h-56 overflow-y-auto border border-rose-200 rounded-lg">
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-rose-50 text-rose-700 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Row</th>
                      <th className="text-left px-2 py-1">Name</th>
                      <th className="text-left px-2 py-1">Status</th>
                      <th className="text-left px-2 py-1">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.details.filter((d) => d.status === 'error').map((d, i) => (
                      <tr key={i} className="border-t border-rose-100 text-rose-800">
                        <td className="px-2 py-1 align-top">{d.row}</td>
                        <td className="px-2 py-1 align-top">{d.studentName}</td>
                        <td className="px-2 py-1 align-top font-bold">Error</td>
                        <td className="px-2 py-1 align-top whitespace-pre-wrap">{d.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 py-2 rounded-lg border border-zinc-200 bg-white text-zinc-700 text-xs font-mono font-semibold hover:bg-zinc-50">Upload Another File</button>
              <button onClick={onBack} className="flex-1 py-2 rounded-lg bg-zinc-900 text-white text-xs font-mono font-semibold hover:bg-zinc-800">Return to Students</button>
            </div>
          </div>
        )}
      </div>

      {error && !result && (
        <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-medium" role="alert">
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
          {error}
        </div>
      )}
    </div>
  );
};
