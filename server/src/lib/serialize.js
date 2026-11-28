export function rowVersionToBase64(buf) {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64');
}

export function base64ToBuffer(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

export function userJson(row) {
  return {
    userId: row.UserID,
    email: row.Email,
    firstName: row.FirstName,
    lastName: row.LastName,
    phone: row.Phone ?? null,
    role: row.RoleName,
    isActive: !!row.IsActive,
  };
}