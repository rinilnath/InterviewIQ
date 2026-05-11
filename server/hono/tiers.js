export const TIER_CONFIG = {
  free:       { monthlyKits: 5,   label: 'Free',       description: '5 kits / month' },
  pro:        { monthlyKits: 50,  label: 'Pro',        description: '50 kits / month' },
  enterprise: { monthlyKits: 200, label: 'Enterprise', description: '200 kits / month' },
};

export function getEffectiveTier(user) {
  if (user.role === 'admin') return 'unlimited';
  if (
    user.subscription_tier !== 'free' &&
    user.subscription_expires_at &&
    new Date(user.subscription_expires_at) < new Date()
  ) {
    return 'free';
  }
  return user.subscription_tier || 'free';
}

export function getMonthlyLimit(user) {
  const tier = getEffectiveTier(user);
  if (tier === 'unlimited') return Infinity;
  return TIER_CONFIG[tier]?.monthlyKits ?? TIER_CONFIG.free.monthlyKits;
}
