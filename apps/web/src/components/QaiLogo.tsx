import React from 'react';

interface QaiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const QaiLogo: React.FC<QaiLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const sizeMap = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const textMap = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/qai.webp"
        alt="QAI Logo"
        width={56}
        height={56}
        decoding="async"
        className={`${sizeMap[size]} rounded-xl object-contain shrink-0 shadow-2xs border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-0.5`}
      />

      {showText && (
        <div className="min-w-0">
          <div
            className={`font-bold font-mono text-[var(--color-text-primary)] leading-none tracking-tight ${textMap[size]}`}
          >
            QAI <span className="text-[var(--color-brand-400)]">Data Collector</span>
          </div>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-tight mt-0.5">
            Enterprise Raw Data Platform
          </div>
        </div>
      )}
    </div>
  );
};
