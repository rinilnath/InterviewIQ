import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Zap, CheckCircle2, Clock, Crown, Shield,
  Copy, RefreshCw, Globe, Smartphone, ChevronRight,
  ArrowRight, Building2, Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const TIER_META = {
  free:       { color: 'bg-zinc-100 text-zinc-600',    icon: Zap,    label: 'Free' },
  pro:        { color: 'bg-indigo-100 text-indigo-700', icon: Zap,    label: 'Pro' },
  enterprise: { color: 'bg-violet-100 text-violet-700', icon: Crown,  label: 'Enterprise' },
  unlimited:  { color: 'bg-amber-100 text-amber-700',  icon: Crown,  label: 'Admin' },
};

const UPI_APPS = [
  { name: 'GPay',    scheme: 'tez://upi/pay',       logo: '🟢' },
  { name: 'PhonePe', scheme: 'phonepe://pay',        logo: '🟣' },
  { name: 'Paytm',   scheme: 'paytmmp://upi/pay',   logo: '🔵' },
  { name: 'BHIM',    scheme: 'upi://pay',            logo: '🟠' },
];

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

function buildUpiLink(upiId, amount, note = 'InterviewIQ Subscription') {
  const params = new URLSearchParams({
    pa: upiId,
    am: String(amount),
    cu: 'INR',
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

// ─── Payment Dialog ───────────────────────────────────────────────────────────

function PaymentDialog({ open, onClose, selectedPlan, plans, payInfo, pendingRequest }) {
  const queryClient = useQueryClient();
  const [region, setRegion] = useState('india');  // 'india' | 'international'
  const [utrNumber, setUtrNumber] = useState('');
  const [copied, setCopied] = useState(null);

  const plan = selectedPlan ? plans[selectedPlan.key] : null;
  const amount = plan
    ? selectedPlan.period === 'annual' ? plan.annualPrice : plan.monthlyPrice
    : 0;

  const upiDeepLink = payInfo?.info?.upiId
    ? buildUpiLink(payInfo.info.upiId, amount, `InterviewIQ ${plan?.label} ${selectedPlan?.period}`)
    : null;

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
      toast.success('Copied to clipboard');
    });
  };

  const submitMutation = useMutation({
    mutationFn: () => api.post('/payment/upgrade-request', {
      requestedTier: selectedPlan.key,
      planPeriod:    selectedPlan.period,
      amountInr:     amount,
      utrNumber,
      paymentMethod: region === 'india' ? 'upi' : 'bank_transfer',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment', 'my-requests']);
      onClose();
      setUtrNumber('');
      toast.success(
        'Payment submitted!',
        'We\'ll verify your payment and activate your plan within 24 hours.'
      );
    },
    onError: (err) => toast.error('Submission failed', err.response?.data?.error || 'Please try again.'),
  });

  if (!selectedPlan || !plan) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl [&>button.absolute]:text-white/70 [&>button.absolute]:hover:text-white">
        {/* Header — dark gradient, Anthropic-style */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 px-6 pt-6 pb-5">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-400 tracking-wide uppercase">Secure Checkout</span>
            </div>
            <DialogTitle className="text-white text-xl font-semibold">
              InterviewIQ {plan.label}
            </DialogTitle>
          </DialogHeader>

          {/* Order summary */}
          <div className="mt-4 rounded-xl bg-white/5 border border-white/10 divide-y divide-white/10">
            <div className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-white">{plan.label} Plan · {selectedPlan.period === 'annual' ? 'Annual' : 'Monthly'}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{plan.monthlyKits} interview kits / month</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">₹{fmt(amount)}</p>
                {selectedPlan.period === 'annual' && (
                  <p className="text-xs text-emerald-400">2 months free</p>
                )}
              </div>
            </div>
            <div className="px-4 py-2 flex justify-between items-center">
              <span className="text-xs text-zinc-400">Total due today</span>
              <span className="text-sm font-semibold text-white">₹{fmt(amount)}</span>
            </div>
          </div>
        </div>

        {/* Payment body */}
        <div className="bg-white px-6 py-5 space-y-5">

          {/* Region selector */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Pay with</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'india', label: 'India · UPI', icon: Smartphone, sub: 'GPay, PhonePe, Paytm' },
                { key: 'international', label: 'International', icon: Globe, sub: 'Bank Wire Transfer' },
              ].map(({ key, label, icon: Icon, sub }) => (
                <button
                  key={key}
                  onClick={() => setRegion(key)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all',
                    region === key
                      ? 'border-zinc-900 bg-zinc-50'
                      : 'border-zinc-200 hover:border-zinc-300 bg-white'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', region === key ? 'text-zinc-900' : 'text-zinc-400')} />
                  <div>
                    <p className={cn('text-xs font-semibold', region === key ? 'text-zinc-900' : 'text-zinc-600')}>{label}</p>
                    <p className="text-[10px] text-zinc-400">{sub}</p>
                  </div>
                  {region === key && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-zinc-900" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Payment details */}
          <AnimatePresence mode="wait">
            {region === 'india' ? (
              <motion.div
                key="india"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {payInfo?.info?.upiId ? (
                  <>
                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                      <div className="p-3 bg-white rounded-xl shadow-sm border border-zinc-100">
                        <QRCodeSVG
                          value={upiDeepLink}
                          size={160}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-zinc-800">Scan to pay ₹{fmt(amount)}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Works with any UPI app</p>
                      </div>

                      {/* UPI app quick links */}
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        {UPI_APPS.map((app) => (
                          <a
                            key={app.name}
                            href={`${app.scheme}?pa=${payInfo.info.upiId}&am=${amount}&cu=INR&tn=InterviewIQ`}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:border-zinc-400 transition-colors"
                          >
                            <span>{app.logo}</span> {app.name}
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* UPI ID manual copy */}
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-zinc-200 bg-white">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-wide">UPI ID</p>
                        <p className="text-sm font-mono font-semibold text-zinc-900">{payInfo.info.upiId}</p>
                      </div>
                      <button
                        onClick={() => copyText(payInfo.info.upiId, 'upi')}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                          copied === 'upi'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-transparent'
                        )}
                      >
                        {copied === 'upi' ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied === 'upi' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-2 p-6 rounded-xl bg-zinc-50 border border-zinc-100 text-sm text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading payment details…
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="international"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                {payInfo?.info?.accountNumber ? (
                  <div className="rounded-xl border border-zinc-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                      <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Bank Wire Transfer</span>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {[
                        ['Account No.', payInfo.info.accountNumber, 'acct'],
                        ['IFSC Code',   payInfo.info.ifsc,          'ifsc'],
                        payInfo.info.swift
                          ? ['SWIFT / BIC', payInfo.info.swift,     'swift']
                          : null,
                        ['Bank',         `${payInfo.info.bankName}${payInfo.info.bankBranch ? ` — ${payInfo.info.bankBranch}` : ''}`, null],
                        ['Currency',     'INR (Indian Rupee)',       null],
                        ['Amount',       `₹${fmt(amount)}`,         'amt'],
                      ].filter(Boolean).map(([label, value, copyKey]) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-xs text-zinc-500 min-w-[90px]">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900 font-mono">{value}</span>
                            {copyKey && (
                              <button
                                onClick={() => copyText(value, copyKey)}
                                className={cn(
                                  'p-1 rounded transition-colors',
                                  copied === copyKey ? 'text-emerald-600' : 'text-zinc-300 hover:text-zinc-600'
                                )}
                              >
                                {copied === copyKey ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 p-6 rounded-xl bg-zinc-50 border border-zinc-100 text-sm text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading payment details…
                  </div>
                )}
                <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                  <Wifi className="w-3 h-3" />
                  International transfers may take 1–3 business days to reflect.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* UTR / Reference input */}
          <div className="space-y-2 pt-1 border-t border-zinc-100">
            <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
              Transaction Reference <span className="text-rose-500">*</span>
            </Label>
            <Input
              placeholder={
                region === 'india'
                  ? 'Enter 12-digit UPI transaction ID'
                  : 'Enter UTR / wire reference number'
              }
              value={utrNumber}
              onChange={(e) => setUtrNumber(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-zinc-400">
              {region === 'india'
                ? 'Find this in your UPI app under payment history.'
                : 'Find this in your bank statement or transfer confirmation email.'}
            </p>
          </div>

          {/* Submit */}
          <Button
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold h-11 rounded-xl"
            onClick={() => submitMutation.mutate()}
            disabled={!utrNumber.trim() || submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />&nbsp;Submitting…</>
            ) : (
              <>Confirm Payment&nbsp;<ArrowRight className="w-4 h-4" /></>
            )}
          </Button>

          <p className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            Plan activates within 24 hours after manual verification.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Account Page ────────────────────────────────────────────────────────

export default function Account() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [upgradeDialog, setUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const { data: quota, isLoading: quotaLoading } = useQuery({
    queryKey: ['interview', 'quota'],
    queryFn: async () => (await api.get('/interview/quota')).data,
    staleTime: 60_000,
  });

  const { data: plansData } = useQuery({
    queryKey: ['payment', 'plans'],
    queryFn: async () => (await api.get('/payment/plans')).data,
  });

  const { data: payInfo } = useQuery({
    queryKey: ['payment', 'info'],
    queryFn: async () => (await api.get('/payment/info')).data,
    enabled: upgradeDialog,
    retry: false,
  });

  const { data: myRequests } = useQuery({
    queryKey: ['payment', 'my-requests'],
    queryFn: async () => (await api.get('/payment/my-requests')).data.requests,
    staleTime: 30_000,
  });

  const plans = plansData?.plans || {};
  const tierMeta = TIER_META[quota?.tierKey] || TIER_META.free;
  const TierIcon = tierMeta.icon;
  const pendingRequest = (myRequests || []).find((r) => r.status === 'pending');

  const openUpgrade = (key, period) => {
    setSelectedPlan({ key, period });
    setUpgradeDialog(true);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Page header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">My Account</h2>
        <p className="text-sm text-zinc-500 mt-1">Manage your subscription and usage.</p>
      </div>

      {/* Current plan */}
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
              {pendingRequest.plan_period} upgrade is being verified.
              Reference: <span className="font-mono">{pendingRequest.utr_number}</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Pricing */}
      {user?.role !== 'admin' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">Choose a plan</h3>
            <span className="text-xs text-zinc-400">Prices in INR · All plans include 24hr activation</span>
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
                          <div className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center',
                            key === 'enterprise' ? 'bg-violet-100' : 'bg-indigo-100'
                          )}>
                            {key === 'enterprise'
                              ? <Crown className="w-3.5 h-3.5 text-violet-600" />
                              : <Zap className="w-3.5 h-3.5 text-indigo-600" />
                            }
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
                            className={cn(
                              'w-full font-semibold',
                              key === 'enterprise'
                                ? 'bg-violet-600 hover:bg-violet-700'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                            )}
                            onClick={() => openUpgrade(key, 'monthly')}
                            disabled={!!pendingRequest}
                          >
                            Get {plan.label} Monthly
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
            All prices in INR · UPI & international bank transfer accepted · Activation within 24 hrs
          </p>
        </div>
      )}

      {/* Upgrade history */}
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
                  <p className="text-xs text-zinc-400 font-mono">
                    Ref: {r.utr_number} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </p>
                  {r.admin_note && (
                    <p className="text-xs text-zinc-500 italic">"{r.admin_note}"</p>
                  )}
                </div>
                <Badge className={cn('shrink-0 border-0 text-xs', {
                  'bg-amber-100 text-amber-700':   r.status === 'pending',
                  'bg-emerald-100 text-emerald-700': r.status === 'approved',
                  'bg-rose-100 text-rose-700':     r.status === 'rejected',
                })}>
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment dialog */}
      <PaymentDialog
        open={upgradeDialog}
        onClose={() => setUpgradeDialog(false)}
        selectedPlan={selectedPlan}
        plans={plans}
        payInfo={payInfo}
        pendingRequest={pendingRequest}
      />
    </div>
  );
}
