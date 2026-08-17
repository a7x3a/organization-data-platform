import React, { useState, useEffect } from 'react';
import { formatDuration } from '../lib/utils';

interface LiveDurationProps {
  startedAt: string | null;
  completedAt: string | null;
  status?: string;
  className?: string;
}

export const LiveDuration: React.FC<LiveDurationProps> = ({
  startedAt,
  completedAt,
  status,
  className = 'font-mono text-xs text-[var(--color-text-muted)]',
}) => {
  const isActive =
    !completedAt &&
    (status === 'RUNNING' || status === 'PENDING' || status === 'CANCEL_REQUESTED');

  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!isActive) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, startedAt]);

  return (
    <span className={className}>
      {formatDuration(startedAt, completedAt, isActive ? now : undefined)}
    </span>
  );
};
