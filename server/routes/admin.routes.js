const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../services/supabase.service');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/role.middleware');

const router = express.Router();

router.use(verifyToken, requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at, created_by')
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

module.exports = router;
