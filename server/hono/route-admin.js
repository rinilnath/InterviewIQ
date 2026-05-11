import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getSupabase } from './supabase.js';
import { sendWelcomeEmail } from './email.js';
import { verifyToken } from './auth-middleware.js';
import { requireAdmin } from './role-middleware.js';
import { TIER_CONFIG } from './tiers.js';

const app = new Hono();
app.use('*', verifyToken, requireAdmin);

// GET /api/admin/users
app.get('/users', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, subscription_tier, subscription_expires_at, created_at, created_by')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ users: data });
  } catch (err) {
    console.error('Get users error:', err);
    return c.json({ error: 'Failed to fetch users' }, 500);
  }
});

// POST /api/admin/users
app.post('/users', async (c) => {
  try {
    const { name, email, password, role } = await c.req.json();
    const admin = c.get('user');

    if (!name || !email || !password || !role) {
      return c.json({ error: 'Name, email, password, and role are required' }, 400);
    }
    if (!['admin', 'user'].includes(role)) {
      return c.json({ error: 'Role must be admin or user' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return c.json({ error: 'Email already exists' }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({
        name,
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        role,
        created_by: admin.id,
      })
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (error) throw error;

    // Fire-and-forget welcome email
    c.executionCtx.waitUntil(
      sendWelcomeEmail(c.env, { name, email: data.email, password }).catch((err) =>
        console.error('Welcome email failed:', err.message)
      )
    );

    return c.json({ user: data }, 201);
  } catch (err) {
    console.error('Create user error:', err);
    return c.json({ error: 'Failed to create user' }, 500);
  }
});

// PATCH /api/admin/users/:id
app.patch('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { name, role, is_active } = await c.req.json();

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return c.json({ error: 'Invalid role' }, 400);
      }
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, email, role, is_active, created_at')
      .single();

    if (error) throw error;
    if (!data) return c.json({ error: 'User not found' }, 404);

    return c.json({ user: data });
  } catch (err) {
    console.error('Update user error:', err);
    return c.json({ error: 'Failed to update user' }, 500);
  }
});

// PATCH /api/admin/users/:id/subscription
app.patch('/users/:id/subscription', async (c) => {
  try {
    const id = c.req.param('id');
    const { subscription_tier, subscription_expires_at } = await c.req.json();

    if (!subscription_tier || !Object.keys(TIER_CONFIG).includes(subscription_tier)) {
      return c.json({
        error: `Invalid tier. Must be one of: ${Object.keys(TIER_CONFIG).join(', ')}`,
      }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('users')
      .update({
        subscription_tier,
        subscription_expires_at: subscription_expires_at || null,
      })
      .eq('id', id)
      .select('id, name, email, role, subscription_tier, subscription_expires_at')
      .single();

    if (error) throw error;
    if (!data) return c.json({ error: 'User not found' }, 404);

    return c.json({ user: data });
  } catch (err) {
    console.error('Update subscription error:', err);
    return c.json({ error: 'Failed to update subscription' }, 500);
  }
});

// GET /api/admin/users/:id/usage
app.get('/users/:id/usage', async (c) => {
  try {
    const id = c.req.param('id');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const supabase = getSupabase(c.env);
    const { count, error } = await supabase
      .from('interview_kits')
      .select('id', { count: 'exact', head: true })
      .eq('generated_by', id)
      .gte('created_at', startOfMonth)
      .lt('created_at', nextMonth)
      .in('status', ['generating', 'completed']);

    if (error) throw error;
    return c.json({ used: count || 0 });
  } catch (err) {
    console.error('Get usage error:', err);
    return c.json({ error: 'Failed to fetch usage' }, 500);
  }
});

// DELETE /api/admin/users/:id
app.delete('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const admin = c.get('user');

    if (id === admin.id) {
      return c.json({ error: 'You cannot delete your own account' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data: target, error: fetchErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', id)
      .single();

    if (fetchErr || !target) {
      return c.json({ error: 'User not found' }, 404);
    }

    const tables = [
      { table: 'interview_kits',            column: 'generated_by' },
      { table: 'documents',                 column: 'uploaded_by'  },
      { table: 'upgrade_requests',          column: 'user_id'      },
      { table: 'email_logs',                column: 'user_id'      },
      { table: 'account_deletion_requests', column: 'user_id'      },
    ];

    for (const { table, column } of tables) {
      const { error } = await supabase.from(table).delete().eq(column, id);
      if (error && !error.message.includes('does not exist')) {
        console.error(`[Admin] Delete cascade failed on ${table}:`, error.message);
      }
    }

    const { error: delErr } = await supabase.from('users').delete().eq('id', id);
    if (delErr) throw delErr;

    return c.json({ message: 'User and all associated data deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    return c.json({ error: 'Failed to delete user' }, 500);
  }
});

// POST /api/admin/users/:id/reset-password
app.post('/users/:id/reset-password', async (c) => {
  try {
    const id = c.req.param('id');
    const { newPassword } = await c.req.json();

    if (!newPassword || newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const supabase = getSupabase(c.env);

    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', id);

    if (error) throw error;

    return c.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

// GET /api/admin/deletion-requests
app.get('/deletion-requests', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data: requests, error } = await supabase
      .from('account_deletion_requests')
      .select('id, reason, status, created_at, user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const userIds = [...new Set(requests.map((r) => r.user_id).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      if (users) users.forEach((u) => { usersMap[u.id] = u; });
    }

    const enriched = requests.map((r) => ({ ...r, users: usersMap[r.user_id] || null }));
    return c.json({ requests: enriched });
  } catch (err) {
    console.error('List deletion requests error:', err);
    return c.json({ error: 'Failed to fetch deletion requests' }, 500);
  }
});

// POST /api/admin/deletion-requests/:id/approve
app.post('/deletion-requests/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const admin = c.get('user');
    const supabase = getSupabase(c.env);

    const { data: claimed, error: claimErr } = await supabase
      .from('account_deletion_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: admin.id })
      .eq('id', id)
      .eq('status', 'pending')
      .select('user_id')
      .single();

    if (claimErr || !claimed) {
      return c.json({ error: 'Request not found or already processed by another admin' }, 409);
    }

    const userId = claimed.user_id;

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

    const { error: delErr } = await supabase.from('users').delete().eq('id', userId);
    if (delErr) throw delErr;

    return c.json({ message: 'User data permanently erased' });
  } catch (err) {
    console.error('Approve deletion request error:', err);
    return c.json({ error: 'Failed to process deletion request' }, 500);
  }
});

export default app;
