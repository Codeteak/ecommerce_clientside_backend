/**
 * Match users.phone stored as 10 digits or legacy +91/91 prefixed values.
 * @param {string} columnRef e.g. "u.phone"
 * @param {number} paramIndex 1-based $N for the normalized 10-digit param
 */
export function phoneMatchesStorage(columnRef, paramIndex) {
  const p = `$${paramIndex}`;
  return `(
    ${columnRef} = ${p}
    OR ${columnRef} = '91' || ${p}
    OR ${columnRef} = '+91' || ${p}
    OR right(regexp_replace(${columnRef}, '[^0-9]', '', 'g'), 10) = ${p}
  )`;
}
