// Profile page — placeholder data only, not connected to the real database/session yet.
// Once login is wired to the real API, "currentUser" below should come from the logged-in
// session instead of being hardcoded, and both forms should PUT/PATCH to the real
// /api/users/me and /api/users/me/password endpoints.

let currentUser = {
  firstName: "Deep",
  lastName: "Patel",
  email: "deep.patel@example.edu",
  phone: "814-555-0101",
  role: "Admin",
  // NOTE: no password/hash kept here on purpose — same rule as User Management:
  // never store or display a real/plaintext password client-side.
};

const infoForm = document.getElementById("infoForm");
const infoStatus = document.getElementById("infoStatus");
const firstNameField = document.getElementById("firstName");
const lastNameField = document.getElementById("lastName");
const emailField = document.getElementById("email");
const phoneField = document.getElementById("phone");
const roleField = document.getElementById("role");

const passwordForm = document.getElementById("passwordForm");
const passwordStatus = document.getElementById("passwordStatus");
const currentPasswordField = document.getElementById("currentPassword");
const newPasswordField = document.getElementById("newPassword");
const confirmPasswordField = document.getElementById("confirmPassword");

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = `form-status form-status--${type}`;
  el.style.display = "block";
}

function hideStatus(el) {
  el.style.display = "none";
}

function fillInfoForm() {
  firstNameField.value = currentUser.firstName;
  lastNameField.value = currentUser.lastName;
  emailField.value = currentUser.email;
  phoneField.value = currentUser.phone || "";
  roleField.value = currentUser.role;
}

infoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideStatus(infoStatus);

  currentUser.firstName = firstNameField.value.trim();
  currentUser.lastName = lastNameField.value.trim();
  currentUser.email = emailField.value.trim();
  currentUser.phone = phoneField.value.trim();
  // Role is read-only here on purpose — only an admin changes roles, via User Management.

  // TODO: PATCH /api/users/me with { firstName, lastName, email, phone }
  showStatus(infoStatus, "Account info saved.", "success");
});

passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideStatus(passwordStatus);

  const current = currentPasswordField.value;
  const next = newPasswordField.value;
  const confirm = confirmPasswordField.value;

  if (next.length < 8) {
    showStatus(passwordStatus, "New password must be at least 8 characters.", "error");
    return;
  }
  if (next !== confirm) {
    showStatus(passwordStatus, "New password and confirmation don't match.", "error");
    return;
  }

  // TODO: POST /api/users/me/password with { currentPassword: current, newPassword: next }
  // The real check that `current` is correct happens server-side against the hash —
  // there's nothing to verify it against here since no password is stored client-side.
  passwordForm.reset();
  showStatus(passwordStatus, "Password updated.", "success");
});

// --- Reset Password with a Verification Code ---
// NOTE: there's no real email/SMS service wired up yet. This mocks the flow by generating
// a code client-side and showing it in the status banner so the form is actually testable.
// Once the backend exists, "Send Code" should POST to trigger a real email/SMS send, and
// the code should never be visible to the browser — verification happens server-side.

const resetForm = document.getElementById("resetForm");
const resetStatus = document.getElementById("resetStatus");
const resetMethod = document.getElementById("resetMethod");
const sendCodeBtn = document.getElementById("sendCodeBtn");
const resetStep1 = document.getElementById("resetStep1");
const resetStep2 = document.getElementById("resetStep2");
const resetCodeField = document.getElementById("resetCode");
const resetNewPasswordField = document.getElementById("resetNewPassword");
const resetConfirmPasswordField = document.getElementById("resetConfirmPassword");

let pendingResetCode = null;

sendCodeBtn.addEventListener("click", () => {
  hideStatus(resetStatus);

  pendingResetCode = String(Math.floor(100000 + Math.random() * 900000));
  const destination = resetMethod.value === "email" ? currentUser.email : (currentUser.phone || "your phone on file");

  resetStep1.style.display = "none";
  resetStep2.style.display = "block";
  showStatus(resetStatus, `Code sent to ${destination}. (Dev mode — your code is ${pendingResetCode})`, "success");
});

resetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideStatus(resetStatus);

  if (resetStep2.style.display === "none") return;

  if (resetCodeField.value.trim() !== pendingResetCode) {
    showStatus(resetStatus, "Incorrect code. Check it and try again.", "error");
    return;
  }

  const next = resetNewPasswordField.value;
  const confirm = resetConfirmPasswordField.value;

  if (next.length < 8) {
    showStatus(resetStatus, "New password must be at least 8 characters.", "error");
    return;
  }
  if (next !== confirm) {
    showStatus(resetStatus, "New password and confirmation don't match.", "error");
    return;
  }

  // TODO: POST /api/users/me/password-reset with { code: resetCodeField.value, newPassword: next }
  pendingResetCode = null;
  resetForm.reset();
  resetStep2.style.display = "none";
  resetStep1.style.display = "block";
  showStatus(resetStatus, "Password reset. Use your new password next time you log in.", "success");
});

fillInfoForm();