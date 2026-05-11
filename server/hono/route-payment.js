import { Hono } from 'hono';
import { getSupabase } from './supabase.js';
import { verifyToken } from './auth-middleware.js';
import { requireAdmin } from './role-middleware.js';
import { TIER_CONFIG } from './tiers.js';

const app = new Hono();
app.use('*', verifyToken);

const PLANS = {
  pro: {
    label: 'Pro',
    monthlyKits: TIER_CONFIG.pro.monthlyKits,
    monthlyPrice: 999,
    annualPrice: 9990,
    color: 'indigo',
  },
  enterprise: {
    label: 'Enterprise',
    monthlyKits: TIER_CONFIG.enterprise.monthlyKits,
    monthlyPrice: 2999,
    annualPrice: 29990,
    color: 'violet',
  },
};

// GET /api/payment/plans
app.get('/plans', (c) => {
  return c.json({ plans: PLANS });
});

// GET /api/payment/info
app.get('/info', (c) => {
  const info = {
    upiId:         c.env.PAYMENT_UPI_ID         || null,
    accountNumber: c.env.PAYMENT_ACCOUNT_NUMBER || null,
    ifsc:          c.env.PAYMENT_IFSC           || null,
    bankName:      c.env.PAYMENT_BANK_NAME      || 'SBI',
    bankBranch:    c.env.PAYMENT_BANK_BRANCH    || null,
    swift:         c.env.PAYMENT_SWIFT_CODE     || null,
  };
  if (!info.upiId && !info.accountNumber) {
    return c.json({ error: 'Payment details not configured. Contact admin.' }, 503);
  }
  return c.json({ info });
});

// POST /api/payment/upgrade-request
app.post('/upgrade-request', async (c) => {
  try {
    const { requestedTier, planPeriod, amountInr, utrNumber, paymentMethod } = await c.req.json();
    const user = c.get('user');

    if (!requestedTier || !['pro', 'enterprise'].includes(requestedTier)) {
      return c.json({ error: 'Invalid tier. Must be pro or enterprise.' }, 400);
    }
    if (!planPeriod || !['monthly', 'annual'].includes(planPeriod)) {
      return c.json({ error: 'Invalid plan period.' }, 400);
    }
    if (!amountInr || amountInr <= 0) {
      return c.json({ error: 'Amount paid is required.' }, 400);
    }

    const expectedAmount = planPeriod === 'annual'
      ? PLANS[requestedTier].annualPrice
      : PLANS[requestedTier].monthlyPrice;

    if (amountInr < expectedAmount) {
      return c.json({
        error: `Amount ₹${amountInr} is less than the expected ₹${expectedAmount} for the ${PLANS[requestedTier].label} ${planPeriod} plan.`,
      }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: existing } = await supabase
      .from('upgrade_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return c.json({
        error: 'You already have a pending upgrade request. Please wait for admin review.',
      }, 409);
    }

    const ref = utrNumber?.trim() ||
      `IQ-${user.id.slice(0, 8).toUpperCase()}-${Date.now()}`;

    const { data, error } = await supabase
      .from('upgrade_requests')
      .insert({
        user_id:        user.id,
        requested_tier: requestedTier,
        plan_period:    planPeriod,
        amount_inr:     amountInr,
        utr_number:     ref,
        payment_method: paymentMethod || 'upi',
      })
      .select()
      .single();

    if (error) throw error;
    return c.json({ request: data }, 201);
  } catch (err) {
    console.error('Upgrade request error:', err);
    return c.json({ error: 'Failed to submit upgrade request' }, 500);
  }
});

// GET /api/payment/my-requests
app.get('/my-requests', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data, error } = await supabase
      .from('upgrade_requests')
      .select('id, requested_tier, plan_period, amount_inr, utr_number, payment_method, status, admin_note, created_at, reviewed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ requests: data });
  } catch (err) {
    console.error('Get my requests error:', err);
    return c.json({ error: 'Failed to fetch requests' }, 500);
  }
});

// GET /api/payment/requests — admin only
app.get('/requests', requireAdmin, async (c) => {
  try {
    const status = c.req.query('status') || 'pending';
    const supabase = getSupabase(c.env);

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
    return c.json({ requests: data });
  } catch (err) {
    console.error('Get requests error:', err);
    return c.json({ error: 'Failed to fetch upgrade requests' }, 500);
  }
});

// PATCH /api/payment/requests/:id/approve — admin only
app.patch('/requests/:id/approve', requireAdmin, async (c) => {
  try {
    const id = c.req.param('id');
    const { adminNote, expiresMonths } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: req_, error: fetchErr } = await supabase
      .from('upgrade_requests')
      .select('id, user_id, requested_tier, plan_period, status')
      .eq('id', id)
      .single();

    if (fetchErr || !req_) return c.json({ error: 'Request not found' }, 404);
    if (req_.status === 'approved') return c.json({ error: 'Request is already approved' }, 400);

    const months = expiresMonths || (req_.plan_period === 'annual' ? 12 : 1);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const { error: userErr } = await supabase
      .from('users')
      .update({
        subscription_tier:       req_.requested_tier,
        subscription_expires_at: expiresAt.toISOString(),
      })
      .eq('id', req_.user_id);

    if (userErr) throw userErr;

    const { data, error } = await supabase
      .from('upgrade_requests')
      .update({
        status:      'approved',
        admin_note:  adminNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return c.json({ request: data });
  } catch (err) {
    console.error('Approve request error:', err);
    return c.json({ error: 'Failed to approve request' }, 500);
  }
});

// PATCH /api/payment/requests/:id/reject — admin only
app.patch('/requests/:id/reject', requireAdmin, async (c) => {
  try {
    const id = c.req.param('id');
    const { adminNote } = await c.req.json();
    const user = c.get('user');
    const supabase = getSupabase(c.env);

    if (!adminNote?.trim()) {
      return c.json({ error: 'A reason is required when rejecting a request.' }, 400);
    }

    const { data: req_ } = await supabase
      .from('upgrade_requests')
      .select('status')
      .eq('id', id)
      .single();

    if (!req_) return c.json({ error: 'Request not found' }, 404);
    if (req_.status !== 'pending') return c.json({ error: 'Request is not pending' }, 400);

    const { data, error } = await supabase
      .from('upgrade_requests')
      .update({
        status:      'rejected',
        admin_note:  adminNote.trim(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return c.json({ request: data });
  } catch (err) {
    console.error('Reject request error:', err);
    return c.json({ error: 'Failed to reject request' }, 500);
  }
});

export default app;
