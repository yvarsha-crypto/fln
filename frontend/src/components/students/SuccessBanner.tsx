import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SuccessBannerProps {
  studentId: string;
  studentName: string;
  className: string;
  section: string;
  schoolName?: string;
  aadhaarNumber?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  parentName?: string;
  onRegisterAnother: () => void;
  onViewMyStudents: () => void;
  onDownloadCSV?: () => void;
}

export const SuccessBanner: React.FC<SuccessBannerProps> = ({
  studentId,
  studentName,
  className,
  section,
  schoolName,
  aadhaarNumber,
  dateOfBirth,
  gender,
  parentName,
  onRegisterAnother,
  onViewMyStudents,
  onDownloadCSV,
}) => {
  return (
    <div
      className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-emerald-800">
          Student registered successfully.
        </h4>
        <div className="mt-2 font-mono text-xs text-emerald-700 bg-white/60 p-3 rounded border border-emerald-100 space-y-1 break-words">
          <div>
            <strong>studentId:</strong> <span className="select-all">{studentId}</span>
          </div>
          <div>
            <strong>Name:</strong> {studentName}
          </div>
          <div>
            <strong>Class:</strong> {className} - {section}
            {schoolName ? ` \u00b7 School: ${schoolName}` : ''}
          </div>
          {dateOfBirth && (
            <div>
              <strong>DOB:</strong> {dateOfBirth}
            </div>
          )}
          {gender && (
            <div>
              <strong>Gender:</strong> {gender}
            </div>
          )}
          {parentName && (
            <div>
              <strong>Parent:</strong> {parentName}
            </div>
          )}
          {aadhaarNumber && (
            <div>
              <strong>Aadhaar:</strong> {aadhaarNumber}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            onClick={onRegisterAnother}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold rounded-md"
          >
            Register Another
          </button>
          <button
            onClick={onViewMyStudents}
            className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 font-mono font-bold rounded-md hover:bg-emerald-50"
          >
            View My Students
          </button>
          {onDownloadCSV && (
            <button
              onClick={onDownloadCSV}
              className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 font-mono font-bold rounded-md hover:bg-emerald-50"
            >
              Download receipt
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
