import jwt from 'jsonwebtoken';
import { getCookie } from 'hono/cookie';
import { getSupabase } from './supabase.js';

export async function verifyToken(c, next) {
  try {
    let token = null;
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      token = getCookie(c, 'token');
    }

    if (!token) return c.json({ error: 'No token provided' }, 401);

    const decoded = jwt.verify(token, c.env.JWT_SECRET);
    const supabase = getSupabase(c.env);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, subscription_tier, subscription_expires_at')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) return c.json({ error: 'User not found' }, 401);
    if (!user.is_active) return c.json({ error: 'Account is inactive' }, 403);

    c.set('user', user);
    await next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return c.json({ error: 'Token expired' }, 401);
    return c.json({ error: 'Invalid token' }, 401);
  }
}
