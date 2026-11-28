/** True when applying this update would remove the only remaining active Admin account. */
export function wouldRemoveLastActiveAdmin({
  currentRoleName,
  currentIsActive,
  nextRoleName,
  nextIsActive,
  activeAdminCount,
}) {
  if (currentRoleName !== 'Admin' || !currentIsActive) return false;
  const remainsActiveAdmin = nextIsActive && nextRoleName === 'Admin';
  if (remainsActiveAdmin) return false;
  return activeAdminCount <= 1;
}

/** Admin POST/PUT: reject short passwords only when a non-empty password was sent. */
export function validateOptionalPassword(passwordField) {
  if (passwordField === undefined || passwordField === null || passwordField === '') return null;
  const p = String(passwordField);
  if (p.length < 8) return 'Password must be at least 8 characters';
  return null;
}