import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Zap, CheckCircle2, Clock, Crown, AlertTriangle,
  Copy, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const TIER_META = {
  free:       { color: 'bg-zinc-100 text-zinc-700', icon: Zap,    label: 'Free' },
  pro:        { color: 'bg-indigo-100 text-indigo-700', icon: Zap, label: 'Pro' },
  enterprise: { color: 'bg-violet-100 text-violet-700', icon: Crown, label: 'Enterprise' },
  unlimited:  { color: 'bg-amber-100 text-amber-700',  icon: Crown, label: 'Admin' },
};

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

export default function Account() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [upgradeSheet, setUpgradeSheet] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);    // { key, period }
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');

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
    enabled: upgradeSheet,
    retry: false,
  });

  const { data: myRequests, isLoading: requestsLoading } = useQuery({
    queryKey: ['payment', 'my-requests'],
    queryFn: async () => (await api.get('/payment/my-requests')).data.requests,
    staleTime: 30_000,
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post('/payment/upgrade-request', {
      requestedTier:  selectedPlan.key,
      planPeriod:     selectedPlan.period,
      amountInr:      selectedPlan.period === 'annual'
        ? plansData.plans[selectedPlan.key].annualPrice
        : plansData.plans[selectedPlan.key].monthlyPrice,
      utrNumber,
      paymentMethod,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['payment', 'my-requests']);
      setUpgradeSheet(false);
      setUtrNumber('');
      toast.success(
        'Request submitted!',
        'Admin will verify your payment and upgrade your plan within 24 hours.'
      );
    },
    onError: (err) => toast.error('Submission failed', err.response?.data?.error || 'Please try again.'),
  });

  const plans = plansData?.plans || {};
  const tierMeta = TIER_META[quota?.tierKey] || TIER_META.free;
  const TierIcon = tierMeta.icon;

  const openUpgrade = (key, period) => {
    setSelectedPlan({ key, period });
    setUtrNumber('');
    setPaymentMethod('upi');
    setUpgradeSheet(true);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
  };

  const pendingRequest = (myRequests || []).find((r) => r.status === 'pending');
  const expectedAmount = selectedPlan && plansData
    ? selectedPlan.period === 'annual'
      ? plansData.plans[selectedPlan.key]?.annualPrice
      : plansData.plans[selectedPlan.key]?.monthlyPrice
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">My Account</h2>
        <p className="text-sm text-zinc-500 mt-1">Manage your subscription and view usage.</p>
      </div>

      {/* Current plan card */}
      <Card className="border-zinc-200">
        <CardContent className="p-6">
          {quotaLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center w-12 h-12 rounded-xl', tierMeta.color)}>
                  <TierIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Current Plan</p>
                  <p className="text-lg font-bold text-zinc-900">{quota?.tier} Plan</p>
                  {quota?.expiresAt && (
                    <p className="text-xs text-zinc-400">
                      Expires {new Date(quota.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
              {!quota?.isUnlimited && (
                <div className="flex-1 space-y-2 sm:max-w-xs">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Kits this month</span>
                    <span className={cn('font-semibold', quota?.remaining === 0 ? 'text-rose-600' : 'text-zinc-900')}>
                      {quota?.used} / {quota?.limit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', {
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
                <div className="flex items-center gap-2 text-amber-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Unlimited generation</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending request banner */}
      {pendingRequest && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200"
        >
          <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Upgrade request under review</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your request to upgrade to <strong>{pendingRequest.requested_tier}</strong> ({pendingRequest.plan_period}) is pending admin approval.
              UTR: {pendingRequest.utr_number}
            </p>
          </div>
        </motion.div>
      )}

      {/* Pricing cards */}
      {user?.role !== 'admin' && (
        <div>
          <h3 className="text-base font-semibold text-zinc-900 mb-4">Upgrade Your Plan</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {Object.entries(plans).map(([key, plan]) => {
              const isCurrent = quota?.tierKey === key;
              const isHigher = key === 'enterprise' && quota?.tierKey === 'pro';
              const isLower  = key === 'pro' && quota?.tierKey === 'enterprise';
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className={cn(
                    'border-2 transition-colors',
                    isCurrent ? 'border-indigo-300 bg-indigo-50/30' :
                    key === 'enterprise' ? 'border-violet-200 hover:border-violet-300' :
                    'border-zinc-200 hover:border-indigo-200'
                  )}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{plan.label}</CardTitle>
                        {isCurrent && <Badge className="bg-indigo-100 text-indigo-700 border-0">Current</Badge>}
                        {key === 'enterprise' && !isCurrent && (
                          <Badge className="bg-violet-100 text-violet-700 border-0">Best Value</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-zinc-900">₹{fmt(plan.monthlyPrice)}</span>
                          <span className="text-sm text-zinc-500">/month</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          or ₹{fmt(plan.annualPrice)}/year <span className="text-emerald-600 font-medium">(2 months free)</span>
                        </p>
                      </div>
                      <ul className="space-y-1.5 text-sm text-zinc-600">
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />{plan.monthlyKits} interview kits / month</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />All question types &amp; knowledge base</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />PDF &amp; Excel export</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />Shared Kits access</li>
                        {key === 'enterprise' && (
                          <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />Priority support</li>
                        )}
                      </ul>
                      {!isCurrent && !isLower && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className={cn('flex-1', key === 'enterprise' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-indigo-600 hover:bg-indigo-700')}
                            onClick={() => openUpgrade(key, 'monthly')}
                            disabled={!!pendingRequest}
                          >
                            Monthly — ₹{fmt(plan.monthlyPrice)}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => openUpgrade(key, 'annual')}
                            disabled={!!pendingRequest}
                          >
                            Annual — ₹{fmt(plan.annualPrice)}
                          </Button>
                        </div>
                      )}
                      {isLower && (
                        <p className="text-xs text-zinc-400 text-center py-1">Downgrade not available</p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400 mt-3 text-center">
            Pricing in INR inclusive of all charges. Manual verification within 24 business hours.
          </p>
        </div>
      )}

      {/* Request history */}
      {(myRequests || []).length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-zinc-900 mb-3">Upgrade History</h3>
          <div className="space-y-2">
            {myRequests.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border border-zinc-100 bg-zinc-50">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-zinc-900 capitalize">
                    {r.requested_tier} — {r.plan_period}
                    <span className="ml-2 text-zinc-500 font-normal">₹{fmt(r.amount_inr)}</span>
                  </p>
                  <p className="text-xs text-zinc-500">UTR: {r.utr_number} · {new Date(r.created_at).toLocaleDateString('en-IN')}</p>
                  {r.admin_note && <p className="text-xs text-zinc-600 mt-1 italic">"{r.admin_note}"</p>}
                </div>
                <Badge className={cn('shrink-0 border-0', {
                  'bg-amber-100 text-amber-700': r.status === 'pending',
                  'bg-emerald-100 text-emerald-700': r.status === 'approved',
                  'bg-rose-100 text-rose-700': r.status === 'rejected',
                })}>
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade payment sheet */}
      <Sheet open={upgradeSheet} onOpenChange={setUpgradeSheet}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Upgrade to {selectedPlan && plans[selectedPlan.key]?.label} — {selectedPlan?.period === 'annual' ? 'Annual' : 'Monthly'}
            </SheetTitle>
            <SheetDescription>
              Transfer the exact amount below and submit your UTR reference number.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Amount to pay */}
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
              <p className="text-xs text-indigo-500 uppercase tracking-wider">Amount to Pay</p>
              <p className="text-3xl font-bold text-indigo-800 mt-1">₹{fmt(expectedAmount)}</p>
              {selectedPlan?.period === 'annual' && (
                <p className="text-xs text-indigo-500 mt-1">Annual plan — saves 2 months</p>
              )}
            </div>

            {/* Payment details */}
            {payInfo?.info ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-zinc-700">Pay via:</p>

                {payInfo.info.upiId && (
                  <div className="p-3 rounded-lg border border-zinc-200 bg-white space-y-1">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">UPI (Recommended)</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono font-semibold text-zinc-900">{payInfo.info.upiId}</p>
                      <button onClick={() => copyToClipboard(payInfo.info.upiId)} className="text-zinc-400 hover:text-indigo-600 transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {payInfo.info.accountNumber && (
                  <div className="p-3 rounded-lg border border-zinc-200 bg-white space-y-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Bank Transfer / NEFT / IMPS</p>
                    {[
                      ['Account Name', payInfo.info.accountName],
                      ['Account No.', payInfo.info.accountNumber],
                      ['IFSC Code', payInfo.info.ifsc],
                      ['Bank', `${payInfo.info.bankName}${payInfo.info.bankBranch ? ` — ${payInfo.info.bankBranch}` : ''}`],
                    ].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-zinc-500">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-900">{value}</span>
                          {label !== 'Bank' && (
                            <button onClick={() => copyToClipboard(value)} className="text-zinc-300 hover:text-indigo-500 transition-colors">
                              <Copy className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-zinc-400">
                  Add your name / email in the payment remarks so we can match it quickly.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-sm text-zinc-500 text-center">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />
                Loading payment details...
              </div>
            )}

            {/* UTR submission */}
            <div className="space-y-4 pt-2 border-t border-zinc-100">
              <p className="text-sm font-semibold text-zinc-700">After paying, submit your reference:</p>

              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer / NEFT / IMPS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>UTR / Transaction ID <span className="text-rose-500">*</span></Label>
                <Input
                  placeholder={paymentMethod === 'upi' ? '12-digit UPI transaction ID' : 'UTR number from bank statement'}
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                />
                <p className="text-xs text-zinc-400">
                  Find this in your UPI app / bank SMS after payment.
                </p>
              </div>

              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={() => submitMutation.mutate()}
                disabled={!utrNumber.trim() || submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  'Submit Payment Confirmation'
                )}
              </Button>

              <p className="text-xs text-zinc-400 text-center">
                Your plan will be activated within 24 business hours after verification.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
