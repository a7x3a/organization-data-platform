import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Button } from './Button';
import { Input } from './Input';
import { Send, CheckCircle2, AlertCircle, Lock, ShieldCheck, X, RefreshCw } from 'lucide-react';

interface TelegramSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COUNTRY_CODES = [
  { code: '+964', country: 'Iraq 🇮🇶', flag: '🇮🇶' },
  { code: '+1', country: 'US / Canada 🇺🇸/🇨🇦', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom 🇬🇧', flag: '🇬🇧' },
  { code: '+971', country: 'UAE 🇦🇪', flag: '🇦🇪' },
  { code: '+966', country: 'Saudi Arabia 🇸🇦', flag: '🇸🇦' },
  { code: '+90', country: 'Turkey 🇹🇷', flag: '🇹🇷' },
  { code: '+49', country: 'Germany 🇩🇪', flag: '🇩🇪' },
  { code: '+33', country: 'France 🇫🇷', flag: '🇫🇷' },
  { code: '+91', country: 'India 🇮🇳', flag: '🇮🇳' },
  { code: '+86', country: 'China 🇨🇳', flag: '🇨🇳' },
  { code: 'other', country: 'Custom Prefix...', flag: '🌐' },
];

export const TelegramSetupModal: React.FC<TelegramSetupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'status' | 'phone' | 'code'>('status');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status state
  const [status, setStatus] = useState<{
    is_configured: boolean;
    is_authorized: boolean;
    user?: { id: number; first_name: string; username: string; phone: string };
    phone_number?: string;
    reason?: string;
  } | null>(null);

  // Phone input split state
  const [countryCode, setCountryCode] = useState('+964');
  const [customPrefix, setCustomPrefix] = useState('+');
  const [localNumber, setLocalNumber] = useState('');

  // Form state
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [tempSession, setTempSession] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);

  const getFullPhoneNumber = () => {
    const activePrefix = countryCode === 'other' ? customPrefix.trim() : countryCode;
    let cleanLocal = localNumber.trim().replace(/[\s\-\(\)]/g, '');
    // If local number starts with 0 (e.g. 07501234567), trim the leading 0 when prefix is present
    if (cleanLocal.startsWith('0') && activePrefix) {
      cleanLocal = cleanLocal.substring(1);
    }
    if (!activePrefix) return cleanLocal.startsWith('+') ? cleanLocal : `+${cleanLocal}`;
    const cleanPrefix = activePrefix.startsWith('+') ? activePrefix : `+${activePrefix}`;
    return `${cleanPrefix}${cleanLocal}`;
  };

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get('/telegram/status');
      setStatus(resp.data);
      if (resp.data?.is_authorized) {
        setStep('status');
      } else {
        setStep('phone');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to check Telegram status');
      setStep('phone');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const fullPhone = getFullPhoneNumber();
    if (!fullPhone || fullPhone.length < 8 || !localNumber.trim()) {
      setError('Please enter a valid phone number (e.g. 7501234567)');
      return;
    }

    setLoading(true);
    try {
      const resp = await apiClient.post('/telegram/send-code', {
        phone: fullPhone,
      });

      if (resp.data?.phone_code_hash || resp.data?.success) {
        setPhoneCodeHash(resp.data.phone_code_hash);
        if (resp.data.temp_session) {
          setTempSession(resp.data.temp_session);
        }
        setStep('code');
        setSuccessMsg(resp.data.message || `Verification OTP code sent to your Telegram app for ${fullPhone}!`);
      } else {
        setError(resp.data?.error || 'Failed to send verification code. Please check your phone number.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to send verification code';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!code.trim()) {
      setError('Please enter the 5-digit verification code sent to your Telegram app');
      return;
    }

    const fullPhone = getFullPhoneNumber();

    setLoading(true);
    try {
      const resp = await apiClient.post('/telegram/verify-code', {
        phone: fullPhone,
        phoneCodeHash,
        code: code.trim(),
        password: password.trim() || undefined,
        tempSession,
      });

      if (resp.data?.success) {
        setSuccessMsg(`Successfully authenticated as ${resp.data?.user?.first_name || 'Telegram User'}! Account session saved.`);
        await fetchStatus();
        if (onSuccess) onSuccess();
      } else if (resp.data?.requires_2fa) {
        setRequires2FA(true);
        setError('2FA Cloud Password required. Enter your 2FA password below and click Verify.');
      } else {
        setError(resp.data?.error || 'Verification failed. Please check the OTP code.');
      }
    } catch (err: any) {
      const serverErr = err?.response?.data;
      if (serverErr?.requires_2fa || err?.response?.status === 401) {
        setRequires2FA(true);
        setError('2FA Cloud Password required. Enter your 2FA password below and click Verify.');
      } else {
        setError(serverErr?.error || serverErr?.message || err?.message || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const fullPhonePreview = getFullPhoneNumber();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs font-sans overflow-y-auto">
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Telegram Account Setup
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Connect your Telegram account to scrape channels
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs rounded-lg bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Loading state while checking status for the first time */}
          {loading && status === null ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[var(--color-brand-400)] animate-spin" />
              <span className="text-xs text-[var(--color-text-muted)] font-mono">Checking Telegram account status...</span>
            </div>
          ) : status?.is_authorized && step === 'status' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-300">
                    Telegram Authorized & Ready
                  </div>
                  <div className="text-xs text-emerald-400/90 font-mono mt-0.5 truncate">
                    {status.user?.first_name ? `User: ${status.user.first_name}` : ''} {status.user?.username ? `(@${status.user.username})` : ''} {status.phone_number || status.user?.phone ? `(${status.phone_number || status.user?.phone})` : ''}
                  </div>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Your Telegram session is active. All Telegram collectors will use your authorized account to collect historical messages and media.
              </p>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setStep('phone')}
                  >
                    Re-authenticate
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await apiClient.post('/telegram/disconnect');
                        setStatus(null);
                        setStep('phone');
                        setSuccessMsg('Telegram session disconnected.');
                      } catch (err: any) {
                        setError(err?.response?.data?.message || err?.message || 'Failed to disconnect');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    Disconnect
                  </Button>
                </div>
                <Button type="button" variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : step === 'phone' ? (
            /* Step 1: Phone Number */
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <div>
                  Enter your Telegram phone number. We will send a 5-digit verification code directly to your Telegram app.
                </div>
              </div>

              {/* Country Code & Local Number selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center justify-between">
                  <span>Telegram Phone Number <span className="text-red-400">*</span></span>
                  <span className="text-[11px] font-mono text-emerald-400 font-medium">
                    Preview: {fullPhonePreview}
                  </span>
                </label>

                <div className="grid grid-cols-12 gap-2">
                  {/* Country Selector */}
                  <div className="col-span-5">
                    <div className="relative">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-full h-9 px-2.5 text-xs bg-[var(--color-bg-overlay)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-400)] cursor-pointer"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.code} ({c.country.split(' ')[0]})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Local Phone Number Input */}
                  <div className="col-span-7">
                    {countryCode === 'other' ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          type="text"
                          placeholder="+964"
                          value={customPrefix}
                          onChange={(e) => setCustomPrefix(e.target.value)}
                        />
                        <Input
                          type="text"
                          placeholder="7501234567"
                          value={localNumber}
                          onChange={(e) => setLocalNumber(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <Input
                        type="text"
                        placeholder="e.g. 7501234567"
                        value={localNumber}
                        onChange={(e) => setLocalNumber(e.target.value)}
                        required
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      Send Verification Code
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            /* Step 2: OTP Verification Code & 2FA Password */
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                A 5-digit verification code was sent to your Telegram app for <strong>{fullPhonePreview}</strong>.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Telegram Verification OTP Code <span className="text-red-400">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center gap-1">
                  <Lock className={`w-3.5 h-3.5 ${requires2FA ? 'text-amber-400' : 'text-[var(--color-text-muted)]'}`} />
                  <span>2FA Cloud Password</span>
                  <span className="text-[var(--color-text-muted)] font-normal">
                    {requires2FA ? '(Required for your account)' : '(Optional)'}
                  </span>
                </label>
                <Input
                  type="password"
                  placeholder="Your Telegram 2FA Cloud password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={requires2FA ? 'border-amber-400/50 focus:ring-amber-400' : ''}
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('phone');
                  }}
                  className="text-xs text-[var(--color-brand-400)] hover:underline cursor-pointer"
                >
                  ← Change Phone Number
                </button>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={loading}>
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify & Save Session'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
