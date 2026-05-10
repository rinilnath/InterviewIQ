import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, BrainCircuit, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';

function passwordStrength(pw) {
  if (!pw) return null;
  const hasUpper  = /[A-Z]/.test(pw);
  const hasLower  = /[a-z]/.test(pw);
  const hasDigit  = /[0-9]/.test(pw);
  const longEnough = pw.length >= 8;
  if (longEnough && hasUpper && hasLower && hasDigit) return 'strong';
  if (longEnough && (hasUpper || hasLower) && (hasDigit || hasUpper)) return 'fair';
  return 'weak';
}

const STRENGTH_META = {
  weak:   { label: 'Weak',   color: 'bg-rose-400',  text: 'text-rose-500' },
  fair:   { label: 'Fair',   color: 'bg-amber-400',  text: 'text-amber-600' },
  strong: { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' },
};

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [inviteState, setInviteState] = useState('loading'); // loading | valid | invalid
  const [inviteError, setInviteError] = useState('');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [prefillName,  setPrefillName]  = useState('');

  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const widgetRef = useRef(null);
  const widgetId  = useRef(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      toast.error('Invalid link', 'Invalid registration link.');
      return;
    }

    api.get(`/auth/invite/validate?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setPrefillEmail(res.data.email);
        if (res.data.name) {
          setPrefillName(res.data.name);
          setName(res.data.name);
        }
        setInviteState('valid');
      })
      .catch((err) => {
        const msg = err.response?.data?.error || 'This invitation link is invalid, has already been used, or has expired.';
        setInviteError(msg);
        setInviteState('invalid');
      });
  }, [token]);

  // Mount Turnstile widget once invite is valid
  const mountTurnstile = useCallback(() => {
    if (!window.turnstile || !widgetRef.current || widgetId.current !== null) return;
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey) return; // skip in dev if not configured
    widgetId.current = window.turnstile.render(widgetRef.current, {
      sitekey,
      callback: (t) => setTurnstileToken(t),
      'expired-callback': () => setTurnstileToken(''),
      'error-callback':   () => setTurnstileToken(''),
    });
  }, []);

  useEffect(() => {
    if (inviteState !== 'valid') return;
    // turnstile may not be loaded yet; poll until available
    const interval = setInterval(() => {
      if (window.turnstile) {
        clearInterval(interval);
        mountTurnstile();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [inviteState, mountTurnstile]);

  const strength    = passwordStrength(password);
  const mismatch    = confirm && password !== confirm;
  const siteKeySet  = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const canSubmit   = (
    name.trim().length >= 2 &&
    strength === 'strong' &&
    !mismatch &&
    confirm &&
    (!siteKeySet || turnstileToken) &&
    !submitting
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError('');
    try {
      await api.post('/auth/register', {
        token,
        name:           name.trim(),
        password,
        turnstileToken: turnstileToken || undefined,
      });
      toast.success('Account created!', 'Please log in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.error || 'Registration failed. Please try again.');
      // Reset Turnstile on error
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.reset(widgetId.current);
        setTurnstileToken('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (inviteState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (inviteState === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-zinc-50 flex items-center justify-center p-4">
        <Card className="shadow-xl border-zinc-200 w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-rose-600" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">Invitation Invalid</h2>
            <p className="text-sm text-zinc-500">{inviteError}</p>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-zinc-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl border-zinc-200">
          <CardHeader className="pb-2 pt-8 px-8">
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 shadow-lg">
                <BrainCircuit className="w-7 h-7 text-white" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-zinc-900">Create your account</h1>
                <p className="text-sm text-zinc-500 mt-1">You've been invited to InterviewIQ</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot — bots fill this, humans don't see it */}
              <input
                type="text"
                name="website"
                autoComplete="off"
                style={{ display: 'none' }}
                tabIndex={-1}
                aria-hidden="true"
              />

              {serverError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 rounded-md bg-rose-50 border border-rose-200 text-sm text-rose-700"
                >
                  {serverError}
                </motion.div>
              )}

              {/* Email — pre-filled, read-only */}
              <div className="space-y-1.5">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={prefillEmail}
                  disabled
                  className="bg-zinc-50 text-zinc-500"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Smith"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 chars, upper + lower + digit"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {password && strength && (
                  <div className="space-y-1">
                    <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        strength === 'weak'   ? 'w-1/3 bg-rose-400' :
                        strength === 'fair'   ? 'w-2/3 bg-amber-400' :
                        'w-full bg-emerald-500'
                      }`} />
                    </div>
                    <p className={`text-xs font-medium ${STRENGTH_META[strength].text}`}>
                      {STRENGTH_META[strength].label} password
                      {strength !== 'strong' && ' — add uppercase, lowercase, and a digit'}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={mismatch ? 'border-rose-400 focus-visible:ring-rose-400' : ''}
                />
                {mismatch && <p className="text-xs text-rose-500">Passwords do not match</p>}
              </div>

              {/* Cloudflare Turnstile widget */}
              {siteKeySet && (
                <div ref={widgetRef} />
              )}

              <Button
                type="submit"
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700"
                disabled={!canSubmit}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-zinc-400 mt-6">
              Already have an account?{' '}
              <button
                className="text-indigo-600 hover:underline"
                onClick={() => navigate('/login')}
              >
                Sign in
              </button>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
