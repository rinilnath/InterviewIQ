// Subscription tier definitions.
// Admin role bypasses quota entirely regardless of tier.
const TIER_CONFIG = {
  free:       { monthlyKits: 5,   label: 'Free',       description: '5 kits / month' },
  pro:        { monthlyKits: 50,  label: 'Pro',        description: '50 kits / month' },
  enterprise: { monthlyKits: 200, label: 'Enterprise', description: '200 kits / month' },
};

/**
 * Returns the effective tier key for a user, accounting for expiry.
 * Admins are always 'unlimited'.
 */
function getEffectiveTier(user) {
  if (user.role === 'admin') return 'unlimited';
  if (
    user.subscription_tier !== 'free' &&
    user.subscription_expires_at &&
    new Date(user.subscription_expires_at) < new Date()
  ) {
    return 'free'; // paid tier has lapsed → fall back to free
  }
  return user.subscription_tier || 'free';
}

/**
 * Returns the monthly kit limit for a user.
 * Returns Infinity for admins.
 */
function getMonthlyLimit(user) {
  const tier = getEffectiveTier(user);
  if (tier === 'unlimited') return Infinity;
  return TIER_CONFIG[tier]?.monthlyKits ?? TIER_CONFIG.free.monthlyKits;
}

module.exports = { TIER_CONFIG, getEffectiveTier, getMonthlyLimit };
