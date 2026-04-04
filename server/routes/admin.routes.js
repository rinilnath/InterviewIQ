const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');
const { TIER_CONFIG } = require('../config/tiers');
const { sendWelcomeEmail } = require('../services/email.service');

const router = express.Router();

router.use(verifyToken, requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, subscription_tier, subscription_expires_at, created_at, created_by')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role,
        created_by: req.user.id,
      })
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (error) throw error;

    // Send welcome email — fire-and-forget (don't block response on email delivery)
    sendWelcomeEmail({ name, email: data.email, password }).catch((err) =>
      console.error('Welcome email failed:', err.message)
    );

    res.status(201).json({ user: data });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, is_active } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json({ user: data });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PATCH /api/admin/users/:id/subscription
router.patch('/users/:id/subscription', async (req, res) => {
  try {
    const { id } = req.params;
    const { subscription_tier, subscription_expires_at } = req.body;

    if (!subscription_tier || !Object.keys(TIER_CONFIG).includes(subscription_tier)) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(TIER_CONFIG).join(', ')}`,
      });
    }

    const updates = { subscription_tier };
    // null = never expires; a date string = time-boxed access
    updates.subscription_expires_at = subscription_expires_at || null;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, email, role, subscription_tier, subscription_expires_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json({ user: data });
  } catch (err) {
    console.error('Update subscription error:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// GET /api/admin/users/:id/usage — view a user's current month kit usage
router.get('/users/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const { count, error } = await supabase
      .from('interview_kits')
      .select('id', { count: 'exact', head: true })
      .eq('generated_by', id)
      .gte('created_at', startOfMonth)
      .lt('created_at', nextMonth)
      .in('status', ['generating', 'completed']);

    if (error) throw error;
    res.json({ used: count || 0 });
  } catch (err) {
    console.error('Get usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// DELETE /api/admin/users/:id — cascade-delete all user data then the user row
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Verify user exists
    const { data: target, error: fetchErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', id)
      .single();

    if (fetchErr || !target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete in dependency order (children first, then the user row)
    const tables = [
      { table: 'interview_kits',       column: 'generated_by' },
      { table: 'documents',            column: 'uploaded_by'  },
      { table: 'upgrade_requests',     column: 'user_id'      },
      { table: 'email_logs',           column: 'user_id'      },
      { table: 'account_deletion_requests', column: 'user_id' },
    ];

    for (const { table, column } of tables) {
      const { error } = await supabase.from(table).delete().eq(column, id);
      // Ignore "table does not exist" style errors for optional tables
      if (error && !error.message.includes('does not exist')) {
        console.error(`[Admin] Delete cascade failed on ${table}:`, error.message);
      }
    }

    // Finally delete the user
    const { error: delErr } = await supabase.from('users').delete().eq('id', id);
    if (delErr) throw delErr;

    res.json({ message: 'User and all associated data deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/admin/deletion-requests — list all pending deletion requests
router.get('/deletion-requests', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, reason, status, created_at, user_id, users(name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ requests: data });
  } catch (err) {
    console.error('List deletion requests error:', err);
    res.status(500).json({ error: 'Failed to fetch deletion requests' });
  }
});

// POST /api/admin/deletion-requests/:id/approve — approve and execute deletion
router.post('/deletion-requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the deletion request
    const { data: request, error: fetchErr } = await supabase
      .from('account_deletion_requests')
      .select('id, user_id, status')
      .eq('id', id)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already processed' });

    const userId = request.user_id;

    // Cascade-delete all user data (same order as admin delete)
    const tables = [
      { table: 'interview_kits',            column: 'generated_by' },
      { table: 'documents',                 column: 'uploaded_by'  },
      { table: 'upgrade_requests',          column: 'user_id'      },
      { table: 'email_logs',                column: 'user_id'      },
      { table: 'account_deletion_requests', column: 'user_id'      },
    ];

    for (const { table, column } of tables) {
      const { error } = await supabase.from(table).delete().eq(column, userId);
      if (error && !error.message.includes('does not exist')) {
        console.error(`[Admin] Deletion cascade failed on ${table}:`, error.message);
      }
    }

    // Delete the user row (this also cascades the deletion request via ON DELETE CASCADE)
    const { error: delErr } = await supabase.from('users').delete().eq('id', userId);
    if (delErr) throw delErr;

    res.json({ message: 'User data permanently erased' });
  } catch (err) {
    console.error('Approve deletion request error:', err);
    res.status(500).json({ error: 'Failed to process deletion request' });
  }
});

module.exports = router;
