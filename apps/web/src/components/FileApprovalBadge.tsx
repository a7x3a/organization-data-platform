import React from 'react';
import { ApprovalStatus } from '@odp/shared-types';

interface FileApprovalBadgeProps {
  status?: ApprovalStatus | string | null;
  className?: string;
}

export const FileApprovalBadge: React.FC<FileApprovalBadgeProps> = ({
  status = ApprovalStatus.PENDING,
  className = '',
}) => {
  const currentStatus = status || ApprovalStatus.PENDING;

  if (currentStatus === ApprovalStatus.APPROVED) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Approved
      </span>
    );
  }

  if (currentStatus === ApprovalStatus.REJECTED) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        Declined
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Pending
    </span>
  );
};
