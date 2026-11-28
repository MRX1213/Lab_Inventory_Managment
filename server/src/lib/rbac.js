const STAFF = new Set(['Admin', 'Full-time Lab Worker']);
const REVIEWERS = new Set(['Admin', 'Full-time Lab Worker']);

export function isStaff(role) {
  return STAFF.has(role);
}

export function canReview(role) {
  return REVIEWERS.has(role);
}

export function isAdmin(role) {
  return role === 'Admin';
}