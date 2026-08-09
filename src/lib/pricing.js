export const round2 = (n) => Math.round(n * 100) / 100;

// Cost of a single unit (strip or tablet) for a product
export function unitPrice(p, unit) {
  return unit === 'strip' ? p.price : p.price / p.tabletsPerStrip;
}

// Total cost of qty units for a product
export function lineTotal(p, qty, unit) {
  return round2(unitPrice(p, unit) * qty);
}

// Break fractional strip stock into whole strips + tablets
export function stockParts(p) {
  let strips = Math.floor(p.strips + 1e-6);
  let tabs = Math.round((p.strips - strips) * p.tabletsPerStrip);
  while (tabs >= p.tabletsPerStrip) {
    strips += 1;
    tabs -= p.tabletsPerStrip;
  }
  while (tabs < 0) {
    strips -= 1;
    tabs += p.tabletsPerStrip;
  }
  return { strips: Math.max(0, strips), tabs: Math.max(0, tabs) };
}

export function isExpired(expiry) {
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(expiry + 'T00:00:00') < today;
}

export function expiryInfo(expiry) {
  if (!expiry) return { label: 'No expiry', tone: 'muted' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(expiry + 'T00:00:00');
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: `Expired ${-days}d ago`, tone: 'danger' };
  if (days === 0) return { label: 'Expires today', tone: 'danger' };
  if (days <= 90) return { label: `${days}d left`, tone: 'warn' };
  return { label: `${days}d left`, tone: 'ok' };
}

export function money(n, cur = '₹') {
  const v = Math.round(n * 100) / 100;
  return (
    cur +
    v.toLocaleString(undefined, {
      minimumFractionDigits: v % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}
