const express = require('express');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');
const { TIER_CONFIG } = require('../config/tiers');

const router = express.Router();
router.use(verifyToken);

// Pricing table (INR) — single source of truth shared with frontend via API
const PLANS = {
  pro: {
    label: 'Pro',
    monthlyKits: TIER_CONFIG.pro.monthlyKits,
    monthlyPrice: 999,
    annualPrice: 9990,   // 2 months free
    color: 'indigo',
  },
  enterprise: {
    label: 'Enterprise',
    monthlyKits: TIER_CONFIG.enterprise.monthlyKits,
    monthlyPrice: 2999,
    annualPrice: 29990,  // 2 months free
    color: 'violet',
  },
};

// GET /api/payment/plans — public pricing (authenticated, no secrets)
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

// GET /api/payment/info — bank/UPI details from environment variables
// accountName is intentionally excluded — money routes via UPI ID / account number alone
router.get('/info', (req, res) => {
  const info = {
    upiId:         process.env.PAYMENT_UPI_ID         || null,
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || null,
    ifsc:          process.env.PAYMENT_IFSC           || null,
    bankName:      process.env.PAYMENT_BANK_NAME      || 'SBI',
    bankBranch:    process.env.PAYMENT_BANK_BRANCH    || null,
    swift:         process.env.PAYMENT_SWIFT_CODE     || null,
  };
  // Ensure at least one payment method is configured
  if (!info.upiId && !info.accountNumber) {
    return res.status(503).json({ error: 'Payment details not configured. Contact admin.' });
  }
  res.json({ info });
});

// POST /api/payment/upgrade-request — submit payment proof
router.post('/upgrade-request', async (req, res) => {
  try {
    const { requestedTier, planPeriod, amountInr, utrNumber, paymentMethod } = req.body;

    if (!requestedTier || !['pro', 'enterprise'].includes(requestedTier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be pro or enterprise.' });
    }
    if (!planPeriod || !['monthly', 'annual'].includes(planPeriod)) {
      return res.status(400).json({ error: 'Invalid plan period.' });
    }
    if (!amountInr || amountInr <= 0) {
      return res.status(400).json({ error: 'Amount paid is required.' });
    }

    const expectedAmount = planPeriod === 'annual'
      ? PLANS[requestedTier].annualPrice
      : PLANS[requestedTier].monthlyPrice;

    if (amountInr < expectedAmount) {
      return res.status(400).json({
        error: `Amount ₹${amountInr} is less than the expected ₹${expectedAmount} for the ${PLANS[requestedTier].label} ${planPeriod} plan.`,
      });
    }

    // Prevent duplicate pending requests
    const { data: existing } = await supabase
      .from('upgrade_requests')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'You already have a pending upgrade request. Please wait for admin review.',
      });
    }

    // Auto-generate reference if user didn't provide one (UX: no UTR input required)
    const ref = utrNumber?.trim() ||
      `IQ-${req.user.id.slice(0, 8).toUpperCase()}-${Date.now()}`;

    const { data, error } = await supabase
      .from('upgrade_requests')
      .insert({
        user_id:        req.user.id,
        requested_tier: requestedTier,
        plan_period:    planPeriod,
        amount_inr:     amountInr,
        utr_number:     ref,
        payment_method: paymentMethod || 'upi',
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ request: data });
  } catch (err) {
    console.error('Upgrade request error:', err);
    res.status(500).json({ error: 'Failed to submit upgrade request' });
  }
});

// GET /api/payment/my-requests — current user's own upgrade history
router.get('/my-requests', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('upgrade_requests')
      .select('id, requested_tier, plan_period, amount_inr, utr_number, payment_method, status, admin_note, created_at, reviewed_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ requests: data });
  } catch (err) {
    console.error('Get my requests error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ─── Admin endpoints ──────────────────────────────────────────────────────

// GET /api/payment/requests — all pending requests (admin only)
router.get('/requests', requireAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    let query = supabase
      .from('upgrade_requests')
      .select(`
        id, requested_tier, plan_period, amount_inr, utr_number,
        payment_method, status, admin_note, created_at, reviewed_at,
        user_id,
        users:user_id ( id, name, email, subscription_tier )
      `)
      .order('created_at', { ascending: true });

    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ requests: data });
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Failed to fetch upgrade requests' });
  }
});

// PATCH /api/payment/requests/:id/approve — approve + auto-upgrade tier
router.patch('/requests/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote, expiresMonths } = req.body;

    const { data: req_, error: fetchErr } = await supabase
      .from('upgrade_requests')
      .select('id, user_id, requested_tier, plan_period, status')
      .eq('id', id)
      .single();

    if (fetchErr || !req_) return res.status(404).json({ error: 'Request not found' });
    if (req_.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    // Calculate expiry: monthly = 1 month, annual = 12 months, or custom
    const months = expiresMonths || (req_.plan_period === 'annual' ? 12 : 1);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Upgrade the user's subscription
    const { error: userErr } = await supabase
      .from('users')
      .update({
        subscription_tier:       req_.requested_tier,
        subscription_expires_at: expiresAt.toISOString(),
      })
      .eq('id', req_.user_id);

    if (userErr) throw userErr;

    // Mark request as approved
    const { data, error } = await supabase
      .from('upgrade_requests')
      .update({
        status:      'approved',
        admin_note:  adminNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ request: data });
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PATCH /api/payment/requests/:id/reject
router.patch('/requests/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!adminNote?.trim()) {
      return res.status(400).json({ error: 'A reason is required when rejecting a request.' });
    }

    const { data: req_ } = await supabase
      .from('upgrade_requests')
      .select('status')
      .eq('id', id)
      .single();

    if (!req_) return res.status(404).json({ error: 'Request not found' });
    if (req_.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    const { data, error } = await supabase
      .from('upgrade_requests')
      .update({
        status:      'rejected',
        admin_note:  adminNote.trim(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ request: data });
  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

module.exports = router;
