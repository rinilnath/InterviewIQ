const suspiciousIps = new Map(); // ip -> { count, firstSeen }
const BLOCK_THRESHOLD = 50;
const BLOCK_WINDOW_MS = 5 * 60 * 1000;
const BLOCKED_IPS = new Set();

const ipGuard = (req, res, next) => {
  const ip = req.ip;

  if (BLOCKED_IPS.has(ip)) {
    return res.status(429).json({ error: 'Access denied.' });
  }

  res.on('finish', () => {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      const now = Date.now();
      const record = suspiciousIps.get(ip) || { count: 0, firstSeen: now };

      if (now - record.firstSeen > BLOCK_WINDOW_MS) {
        suspiciousIps.set(ip, { count: 1, firstSeen: now });
      } else {
        record.count += 1;
        if (record.count >= BLOCK_THRESHOLD) {
          BLOCKED_IPS.add(ip);
          console.warn(`[ipGuard] Blocked IP: ${ip} after ${record.count} 4xx errors`);
        }
        suspiciousIps.set(ip, record);
      }
    }
  });

  next();
};

module.exports = { ipGuard };
