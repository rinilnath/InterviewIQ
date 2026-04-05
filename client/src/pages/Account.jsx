import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Zap, CheckCircle2, Clock, Crown, Shield,
  RefreshCw, Globe, Smartphone, ChevronRight, Building2, AlertCircle, MessageSquare,
  Eye, EyeOff, Lock, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const TIER_META = {
  free:       { color: 'bg-zinc-100 text-zinc-600',     icon: Zap,   label: 'Free' },
  pro:        { color: 'bg-indigo-100 text-indigo-700', icon: Zap,   label: 'Pro' },
  enterprise: { color: 'bg-violet-100 text-violet-700', icon: Crown, label: 'Enterprise' },
  unlimited:  { color: 'bg-amber-100 text-amber-700',   icon: Crown, label: 'Admin' },
};

const UPI_APPS = [
  { name: 'GPay',    href: (pa, am) => `tez://upi/pay?pa=${pa}&am=${am}&cu=INR&tn=InterviewIQ` },
  { name: 'PhonePe', href: (pa, am) => `phonepe://pay?pa=${pa}&am=${am}&cu=INR&tn=InterviewIQ` },
  { name: 'Paytm',   href: (pa, am) => `paytmmp://upi/pay?pa=${pa}&am=${am}&cu=INR&tn=InterviewIQ` },
  { name: 'BHIM',    href: (pa, am) => `upi://pay?pa=${pa}&am=${am}&cu=INR&tn=InterviewIQ` },
];

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

// ─── Payment Dialog ───────────────────────────────────────────────────────────

// ─── Support Dialog ───────────────────────────────────────────────────────────

function SupportDialog({ open, onClose, defaultSubject = '' }) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState('');

  const submitMutation = useMutation({
    mutationFn: () => api.post('/support/contact', { subject: subject.trim(), message: message.trim() }),
    onSuccess: () => {
      onClose();
      setSubject('');
      setMessage('');
      toast.success('Message sent', 'We\'ll get back to you shortly.');
    },
    onError: (err) => toast.error('Failed to send', err.response?.data?.error || 'Please try again.'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[92vw] max-w-[420px] gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl p-0 [&>button.absolute]:text-white/70 [&>button.absolute]:hover:text-white">
        <div className="bg-zinc-900 px-5 py-4">
          <DialogHeader>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Support</span>
            </div>
            <DialogTitle className="text-white text-base font-semibold">Contact Us</DialogTitle>
            <p className="text-xs text-zinc-400 mt-1">We'll reply to your registered email address.</p>
          </DialogHeader>
        </div>

        <div className="bg-white px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Subject</Label>
            <Input
              placeholder="e.g. Payment not verified"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Message</Label>
            <textarea
              rows={5}
              placeholder="Describe your issue in detail…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
            />
          </div>

          <Button
            className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl"
            onClick={() => submitMutation.mutate()}
            disabled={!subject.trim() || message.trim().length < 20 || submitMutation.isPending}
          >
            {submitMutation.isPending
              ? <><RefreshCw className="w-4 h-4 animate-spin" />&nbsp;Sending…</>
              : 'Send Message'}
          </Button>

          <p className="text-[11px] text-zinc-400 text-center">
            We typically respond within 24 hours.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ open, onClose, selectedPlan, plans, payInfo }) {
  const queryClient = useQueryClient();
  const [region, setRegion] = useState('india');
  const [paid, setPaid] = useState(false);

  const plan  = selectedPlan ? plans[selectedPlan.key] : null;
  const amount = plan
    ? (selectedPlan.period === 'annual' ? plan.annualPrice : plan.monthlyPrice)
    : 0;

  const upiLink = payInfo?.info?.upiId
    ? `upi://pay?pa=${payInfo.info.upiId}&am=${amount}&cu=INR&tn=InterviewIQ+${plan?.label}`
    : null;

  const handleClose = () => { setPaid(false); onClose(); };

  const submitMutation = useMutation({
    mutationFn: () => api.post('/payment/upgrade-request', {
      requestedTier: selectedPlan.key,
      planPeriod:    selectedPlan.period,
      amountInr:     amount,
      paymentMethod: region === 'india' ? 'upi' : 'bank_transfer',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment', 'my-requests']);
      handleClose();
      toast.success(
        'Payment received!',
        'Your plan will be activated within 24 hours.'
      );
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Please try again.'),
  });

  if (!selectedPlan || !plan) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[92vw] max-w-[420px] p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl [&>button.absolute]:text-white/70 [&>button.absolute]:hover:text-white">

        {/* Dark header */}
        <div className="bg-zinc-900 px-5 py-4">
          <DialogHeader>
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Secure checkout</span>
            </div>
            <DialogTitle className="text-white text-base font-semibold">
              InterviewIQ {plan.label}
            </DialogTitle>
          </DialogHeader>

          {/* Order row */}
          <div className="mt-3 flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs text-zinc-400 capitalize">{selectedPlan.period} plan · {plan.monthlyKits} kits/mo</p>
              {selectedPlan.period === 'annual' && (
                <p className="text-[10px] text-emerald-400 mt-0.5">2 months free included</p>
              )}
            </div>
            <p className="text-2xl font-bold text-white">₹{fmt(amount)}</p>
          </div>
        </div>

        {/* Body */}
        <div className="bg-white px-5 py-4 space-y-4">

          {/* Region tabs */}
          <div className="flex rounded-xl border border-zinc-200 overflow-hidden p-0.5 bg-zinc-50 gap-0.5">
            {[
              { key: 'india',         label: 'India · UPI',     Icon: Smartphone },
              { key: 'international', label: 'International',   Icon: Globe },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setRegion(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all',
                  region === key
                    ? 'bg-white shadow-sm text-zinc-900 border border-zinc-200'
                    : 'text-zinc-400 hover:text-zinc-600'
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── India UPI ── */}
            {region === 'india' && (
              <motion.div
                key="india"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {upiLink ? (
                  <>
                    {/* QR block */}
                    <div className="flex flex-col items-center gap-3 py-4 px-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div className="p-3 bg-white rounded-xl shadow border border-zinc-100">
                        <QRCodeSVG
                          value={upiLink}
                          size={148}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-zinc-800">Scan &amp; pay ₹{fmt(amount)}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Open your UPI app camera and scan</p>
                      </div>
                    </div>

                    {/* App shortcut buttons */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {UPI_APPS.map((app) => (
                        <a
                          key={app.name}
                          href={app.href(payInfo.info.upiId, amount)}
                          className="flex flex-col items-center gap-1 py-2 rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all text-center"
                        >
                          <span className="text-base leading-none">
                            {app.name === 'GPay' && '🟢'}
                            {app.name === 'PhonePe' && '🟣'}
                            {app.name === 'Paytm' && '🔵'}
                            {app.name === 'BHIM' && '🟠'}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium">{app.name}</span>
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading…
                  </div>
                )}
              </motion.div>
            )}

            {/* ── International ── */}
            {region === 'international' && (
              <motion.div
                key="intl"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {payInfo?.info?.accountNumber ? (
                  <div className="rounded-xl border border-zinc-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border-b border-zinc-100">
                      <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Bank Wire Transfer</span>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {[
                        ['Account No.', payInfo.info.accountNumber],
                        ['IFSC',        payInfo.info.ifsc],
                        payInfo.info.swift ? ['SWIFT', payInfo.info.swift] : null,
                        ['Bank',        payInfo.info.bankName + (payInfo.info.bankBranch ? ` · ${payInfo.info.bankBranch}` : '')],
                        ['Amount',      `₹${fmt(amount)} INR`],
                      ].filter(Boolean).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-4">
                          <span className="text-xs text-zinc-400 w-24 shrink-0">{label}</span>
                          <span className="text-sm font-mono font-medium text-zinc-900 text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading…
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <div className="space-y-2 pt-1">
            <Button
              className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" />&nbsp;Confirming…</>
                : `I've paid · ₹${fmt(amount)}`
              }
            </Button>
            <p className="text-[11px] text-zinc-400 text-center flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" />
              Plan activates within 24 hours after we verify your payment
            </p>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [show, setShow]         = useState({ current: false, next: false, confirm: false });

  const toggle = (field) => setShow((s) => ({ ...s, [field]: !s[field] }));

  const mismatch = confirm && next !== confirm;
  const tooShort = next && next.length < 8;

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', {
      currentPassword: current,
      newPassword:     next,
    }),
    onSuccess: () => {
      setCurrent(''); setNext(''); setConfirm('');
      toast.success('Password updated', 'Your password has been changed successfully.');
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Please try again.'),
  });

  const canSubmit = current && next && confirm && !mismatch && !tooShort && !mutation.isPending;

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Lock className="w-4 h-4 text-zinc-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Change Password</p>
            <p className="text-xs text-zinc-400">Use a strong password — at least 8 characters.</p>
          </div>
        </div>

        <div className="space-y-3 max-w-sm">
          {[
            { id: 'current', label: 'Current password', value: current, set: setCurrent },
            { id: 'next',    label: 'New password',     value: next,    set: setNext,
              hint: tooShort ? 'At least 8 characters required' : null },
            { id: 'confirm', label: 'Confirm new password', value: confirm, set: setConfirm,
              hint: mismatch ? 'Passwords do not match' : null },
          ].map(({ id, label, value, set, hint }) => (
            <div key={id} className="space-y-1">
              <Label className="text-xs font-medium text-zinc-600">{label}</Label>
              <div className="relative">
                <Input
                  type={show[id] ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={cn('pr-9', hint && 'border-rose-300 focus-visible:ring-rose-400')}
                  autoComplete={id === 'current' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  tabIndex={-1}
                >
                  {show[id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {hint && <p className="text-xs text-rose-500">{hint}</p>}
            </div>
          ))}
        </div>

        <Button
          size="sm"
          className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold"
          onClick={() => mutation.mutate()}
          disabled={!canSubmit}
        >
          {mutation.isPending
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />&nbsp;Updating…</>
            : 'Update Password'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Account Page ─────────────────────────────────────────────────────────────

export default function Account() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [upgradeDialog, setUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [supportDialog, setSupportDialog] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletionForm, setShowDeletionForm] = useState(false);

  const { data: quota, isLoading: quotaLoading } = useQuery({
    queryKey: ['interview', 'quota'],
    queryFn:  async () => (await api.get('/interview/quota')).data,
    staleTime: 60_000,
  });

  const { data: plansData } = useQuery({
    queryKey: ['payment', 'plans'],
    queryFn:  async () => (await api.get('/payment/plans')).data,
  });

  const { data: payInfo } = useQuery({
    queryKey: ['payment', 'info'],
    queryFn:  async () => (await api.get('/payment/info')).data,
    enabled:  upgradeDialog,
    retry:    false,
  });

  const { data: myRequests } = useQuery({
    queryKey: ['payment', 'my-requests'],
    queryFn:  async () => (await api.get('/payment/my-requests')).data.requests,
    staleTime: 30_000,
  });

  const { data: deletionReqData, refetch: refetchDeletion } = useQuery({
    queryKey: ['auth', 'deletion-request'],
    queryFn:  async () => (await api.get('/auth/deletion-request')).data,
    staleTime: 60_000,
  });

  const deletionMutation = useMutation({
    mutationFn: () => api.post('/auth/deletion-request', { reason: deletionReason.trim() || undefined }),
    onSuccess: () => {
      refetchDeletion();
      setShowDeletionForm(false);
      setDeletionReason('');
      toast.success('Request submitted', 'An admin will review your deletion request shortly.');
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Could not submit request.'),
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: () => api.delete('/auth/deletion-request'),
    onSuccess: () => {
      refetchDeletion();
      toast.success('Request cancelled', 'Your account deletion request has been withdrawn.');
    },
    onError: (err) => toast.error('Failed', err.response?.data?.error || 'Could not cancel request.'),
  });

  const pendingDeletion = deletionReqData?.request;

  const plans          = plansData?.plans || {};
  const tierMeta       = TIER_META[quota?.tierKey] || TIER_META.free;
  const TierIcon       = tierMeta.icon;
  const pendingRequest  = (myRequests || []).find((r) => r.status === 'pending');
  const rejectedRequest = (myRequests || []).find((r) => r.status === 'rejected' && !pendingRequest);

  const openUpgrade = (key, period) => {
    setSelectedPlan({ key, period });
    setUpgradeDialog(true);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">My Account</h2>
        <p className="text-sm text-zinc-500 mt-1">Manage your subscription and usage.</p>
      </div>

      {/* Current plan card */}
      <Card className="border-zinc-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
        <CardContent className="p-6">
          {quotaLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl', tierMeta.color)}>
                  <TierIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Current Plan</p>
                  <p className="text-lg font-bold text-zinc-900">{quota?.tier} Plan</p>
                  {quota?.expiresAt && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Renews {new Date(quota.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {!quota?.isUnlimited && (
                <div className="flex-1 space-y-2 sm:max-w-xs">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Kits this month</span>
                    <span className={cn('font-semibold tabular-nums', quota?.remaining === 0 ? 'text-rose-600' : 'text-zinc-900')}>
                      {quota?.used} <span className="text-zinc-400 font-normal">/ {quota?.limit}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', {
                        'bg-rose-500':   quota?.percentUsed >= 100,
                        'bg-amber-400':  quota?.percentUsed >= 80 && quota?.percentUsed < 100,
                        'bg-indigo-500': quota?.percentUsed < 80,
                      })}
                      style={{ width: `${Math.min(100, quota?.percentUsed || 0)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400">
                    Resets {new Date(quota?.resetsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
                  </p>
                </div>
              )}

              {quota?.isUnlimited && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Unlimited generation</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending banner */}
      {pendingRequest && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200"
        >
          <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Payment under review</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your <strong className="capitalize">{pendingRequest.requested_tier}</strong>{' '}
              {pendingRequest.plan_period} upgrade is being verified. We'll activate it within 24 hours.
            </p>
          </div>
        </motion.div>
      )}

      {/* Rejection banner */}
      {rejectedRequest && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200"
        >
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-800">Payment could not be verified</p>
            {rejectedRequest.admin_note && (
              <p className="text-xs text-rose-700 mt-0.5">
                Reason: <span className="italic">{rejectedRequest.admin_note}</span>
              </p>
            )}
            <div className="flex items-center gap-3 mt-2.5">
              <button
                onClick={() => {
                  setSupportSubject(`Payment rejected — ${rejectedRequest.requested_tier} ${rejectedRequest.plan_period}`);
                  setSupportDialog(true);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 underline underline-offset-2"
              >
                <MessageSquare className="w-3 h-3" />
                Contact support
              </button>
              <span className="text-rose-300 text-xs">·</span>
              <span className="text-xs text-rose-600">or pay again below to retry</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Pricing cards */}
      {user?.role !== 'admin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">Choose a plan</h3>
            <span className="text-xs text-zinc-400">All prices in INR</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(plans).map(([key, plan], idx) => {
              const isCurrent = quota?.tierKey === key;
              const isLower   = key === 'pro' && quota?.tierKey === 'enterprise';
              const isPopular = key === 'enterprise';

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                >
                  <Card className={cn(
                    'relative border-2 transition-all duration-200 hover:shadow-md',
                    isCurrent
                      ? 'border-indigo-300 shadow-indigo-100/60 shadow-md'
                      : isPopular
                        ? 'border-violet-200 hover:border-violet-300'
                        : 'border-zinc-200 hover:border-indigo-200'
                  )}>
                    {isPopular && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-0.5 rounded-full bg-violet-600 text-white text-xs font-semibold shadow-sm">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <CardHeader className="pb-2 pt-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center',
                            key === 'enterprise' ? 'bg-violet-100' : 'bg-indigo-100'
                          )}>
                            {key === 'enterprise'
                              ? <Crown className="w-3.5 h-3.5 text-violet-600" />
                              : <Zap   className="w-3.5 h-3.5 text-indigo-600" />}
                          </div>
                          <span className="font-semibold text-zinc-900">{plan.label}</span>
                        </div>
                        {isCurrent && (
                          <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-none text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-zinc-900">₹{fmt(plan.monthlyPrice)}</span>
                          <span className="text-sm text-zinc-400">/mo</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          ₹{fmt(plan.annualPrice)}/yr
                          <span className="ml-1 text-emerald-600 font-medium">· save 2 months</span>
                        </p>
                      </div>

                      <ul className="space-y-2 text-sm text-zinc-600">
                        {[
                          `${plan.monthlyKits} interview kits / month`,
                          'All question types & knowledge base',
                          'PDF & Excel export',
                          'Shared Kits access',
                          ...(key === 'enterprise' ? ['Priority support'] : []),
                        ].map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            {feat}
                          </li>
                        ))}
                      </ul>

                      {!isCurrent && !isLower && (
                        <div className="space-y-2 pt-1">
                          <Button
                            size="sm"
                            className={cn('w-full font-semibold',
                              key === 'enterprise'
                                ? 'bg-violet-600 hover:bg-violet-700'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                            )}
                            onClick={() => openUpgrade(key, 'monthly')}
                            disabled={!!pendingRequest}
                          >
                            Get {plan.label} — ₹{fmt(plan.monthlyPrice)}/mo
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => openUpgrade(key, 'annual')}
                            disabled={!!pendingRequest}
                          >
                            Annual — ₹{fmt(plan.annualPrice)}
                            <span className="ml-1.5 text-xs text-emerald-600 font-medium">(Best value)</span>
                          </Button>
                        </div>
                      )}

                      {isLower && (
                        <p className="text-xs text-center text-zinc-400 py-1">Downgrade not available</p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-400 text-center">
            UPI &amp; international bank transfer · Plans activate within 24 hrs of payment
          </p>
        </div>
      )}

      {/* Payment history */}
      {(myRequests || []).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">Payment History</h3>
          <div className="rounded-xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
            {myRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 capitalize truncate">
                    {r.requested_tier} Plan · {r.plan_period}
                    <span className="ml-2 text-zinc-500 font-normal">₹{fmt(r.amount_inr)}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {r.admin_note && (
                    <p className="text-xs text-zinc-500 italic">"{r.admin_note}"</p>
                  )}
                </div>
                <Badge className={cn('shrink-0 border-0 text-xs', {
                  'bg-amber-100 text-amber-700':    r.status === 'pending',
                  'bg-emerald-100 text-emerald-700': r.status === 'approved',
                  'bg-rose-100 text-rose-700':      r.status === 'rejected',
                })}>
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-zinc-900">Security</h3>
        <ChangePasswordSection />
      </div>

      {/* Right to forget */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-zinc-900">Privacy</h3>
        {pendingDeletion ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <Clock className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-rose-700">Deletion request pending</p>
              <p className="text-xs text-rose-500 mt-0.5">
                Submitted {new Date(pendingDeletion.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. An admin will review it shortly.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-xs border-rose-300 text-rose-600 hover:bg-rose-100"
              onClick={() => cancelDeletionMutation.mutate()}
              disabled={cancelDeletionMutation.isPending}
            >
              {cancelDeletionMutation.isPending ? 'Cancelling…' : 'Cancel request'}
            </Button>
          </div>
        ) : showDeletionForm ? (
          <div className="rounded-xl border border-rose-200 bg-white overflow-hidden">
            <div className="bg-rose-50 border-b border-rose-100 px-4 py-3 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <p className="text-sm font-semibold text-rose-700">Request Account Deletion</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-zinc-500">
                Your request will be reviewed by an admin. Once approved, all your data — kits, documents, and account — will be permanently erased.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Reason <span className="font-normal text-zinc-400">(optional)</span></Label>
                <textarea
                  rows={3}
                  placeholder="Tell us why you want to delete your account…"
                  value={deletionReason}
                  onChange={(e) => setDeletionReason(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowDeletionForm(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => deletionMutation.mutate()}
                  disabled={deletionMutation.isPending}
                >
                  {deletionMutation.isPending ? 'Submitting…' : 'Submit Request'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card className="border-zinc-200">
            <CardContent className="px-4 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-900">Delete my account</p>
                <p className="text-xs text-zinc-500 mt-0.5">Request permanent erasure of all your data.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 shrink-0"
                onClick={() => setShowDeletionForm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Request Deletion
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment dialog */}
      <PaymentDialog
        open={upgradeDialog}
        onClose={() => setUpgradeDialog(false)}
        selectedPlan={selectedPlan}
        plans={plans}
        payInfo={payInfo}
      />

      {/* Support dialog */}
      <SupportDialog
        open={supportDialog}
        onClose={() => setSupportDialog(false)}
        defaultSubject={supportSubject}
      />
    </div>
  );
}
