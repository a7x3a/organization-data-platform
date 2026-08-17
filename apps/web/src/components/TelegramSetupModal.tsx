import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { Button } from './Button';
import { Input } from './Input';
import { Send, CheckCircle2, AlertCircle, Lock, ShieldCheck, X, RefreshCw, Key } from 'lucide-react';

interface TelegramSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

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
    reason?: string;
  } | null>(null);

  // Form state
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [tempSession, setTempSession] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);

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

  const formatPhone = (input: string) => {
    let clean = input.trim().replace(/[\s\-\(\)]/g, '');
    if (clean && !clean.startsWith('+')) {
      clean = `+${clean}`;
    }
    return clean;
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const formatted = formatPhone(phoneNumber);
    if (!formatted || formatted.length < 8) {
      setError('Please enter a valid Telegram phone number with country code (e.g. +9647501234567 or +1234567890)');
      return;
    }
    setPhoneNumber(formatted);

    // If API credentials not configured in backend or state, prompt
    if (!status?.is_configured && (!apiId.trim() || !apiHash.trim())) {
      setError('Please enter your Telegram API ID and API Hash from my.telegram.org (or configure them in .env)');
      return;
    }

    setLoading(true);
    try {
      const resp = await apiClient.post('/telegram/send-code', {
        phone: formatted,
        apiId: apiId.trim() || undefined,
        apiHash: apiHash.trim() || undefined,
      });

      if (resp.data?.phone_code_hash || resp.data?.success) {
        const hash = resp.data.phone_code_hash;
        setPhoneCodeHash(hash);
        if (resp.data.temp_session) {
          setTempSession(resp.data.temp_session);
        }
        setStep('code');
        setSuccessMsg(resp.data.message || `Verification OTP code sent to your Telegram app for ${formatted}!`);
      } else {
        setError(resp.data?.error || 'Failed to send verification code. Check phone number and API credentials.');
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

    const formatted = formatPhone(phoneNumber);

    setLoading(true);
    try {
      const resp = await apiClient.post('/telegram/verify-code', {
        phone: formatted,
        phoneCodeHash,
        code: code.trim(),
        password: password.trim() || undefined,
        apiId: apiId.trim() || undefined,
        apiHash: apiHash.trim() || undefined,
        tempSession,
      });

      if (resp.data?.success) {
        setSuccessMsg(`Successfully logged in as ${resp.data?.user?.first_name || 'Telegram User'}! Session string saved.`);
        await fetchStatus();
        if (onSuccess) onSuccess();
      } else if (resp.data?.requires_2fa) {
        setRequires2FA(true);
        setError('2FA Cloud Password required. Enter your Telegram 2FA password below and click Verify.');
      } else {
        setError(resp.data?.error || 'Verification failed. Please check the OTP code.');
      }
    } catch (err: any) {
      const serverErr = err?.response?.data;
      if (serverErr?.requires_2fa || err?.response?.status === 401) {
        setRequires2FA(true);
        setError('2FA Cloud Password required. Enter your Telegram 2FA password below and click Verify.');
      } else {
        setError(serverErr?.error || serverErr?.message || err?.message || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div className="relative w-full max-w-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Telegram Scraper Setup
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Interactive Telethon account login & session generator
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
        <div className="p-6 space-y-5">
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

          {/* Step 1: Account Status (Logged In) */}
          {status?.is_authorized && step === 'status' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-300">
                    Telegram Authorized & Connected
                  </div>
                  <div className="text-xs text-emerald-400/90 font-mono mt-0.5 truncate">
                    Logged in as: {status.user?.first_name} {status.user?.username ? `(@${status.user.username})` : ''}
                  </div>
                </div>
              </div>

              <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Your Telegram scraper session is active and ready to collect messages and files from any public or private channel you join.
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setStep('phone')}
                >
                  Re-authenticate / Change Account
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : step === 'phone' ? (
            /* Step 1: Phone Number & API Credentials */
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <div>
                  Enter your Telegram phone number with country code. The Telegram scraper will send an OTP code directly to your Telegram app.
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center justify-between">
                  <span>Telegram Phone Number <span className="text-red-400">*</span></span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">Country code required</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. +9647501234567 or +1234567890"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center gap-1">
                    <Key className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span>API ID</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 12345678"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center gap-1">
                    <Key className="w-3 h-3 text-[var(--color-text-muted)]" />
                    <span>API Hash</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 0123456789abcdef..."
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
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
                A 5-digit verification code was sent to your Telegram app for <strong>{phoneNumber || 'your account'}</strong>.
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

              <div className="flex items-center justify-between pt-2">
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
