import React from 'react';
import { School as SchoolIcon, GraduationCap, MapPin } from 'lucide-react';
import { School, ClassGroup } from '../../types';

interface GeoConfirmCardProps {
  school: School | null;
  activeClass: ClassGroup | null;
  className?: string;
}

export const GeoConfirmCard: React.FC<GeoConfirmCardProps> = ({
  school,
  activeClass,
  className = '',
}) => {
  return (
    <div
      className={`bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-3 ${className}`}
      aria-label="Auto-filled school and class information"
    >
      <h3 className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2 flex items-center gap-1.5">
        <SchoolIcon className="h-3 w-3" />
        Auto-filled (read-only)
      </h3>

      <div className="space-y-2.5 text-xs">
        <div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase block">School</span>
          <span className="font-semibold text-zinc-900 break-words">
            {school?.name || '\u2014'}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase block">
            School Code
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-zinc-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-xs">
              {school?.id || '\u2014'}
            </span>
            <span className="text-[9px] text-slate-400 italic font-mono">
              hidden - server-derived
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase block">
              District
            </span>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-slate-400" />
              <span className="font-semibold text-zinc-700">
                {school?.districtCode || '\u2014'}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase block">
              Block
            </span>
            <span className="font-semibold text-zinc-700">
              {school?.blockCode || '\u2014'}
            </span>
          </div>
        </div>

        <div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase block">State</span>
          <span className="font-semibold text-zinc-700">{school?.stateCode || '\u2014'}</span>
        </div>

        {activeClass && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Active Class</span>
            </div>
            <div className="mt-1 font-mono font-semibold text-zinc-900">
              {activeClass.className} - {activeClass.section}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] font-mono text-zinc-500 border-t border-zinc-100 pt-2 leading-relaxed">
        School, class, and section are auto-derived from your account. To change your
        assignment, contact your School Principal.
      </p>
    </div>
  );
};
