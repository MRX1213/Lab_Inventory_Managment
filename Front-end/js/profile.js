let currentUserInfo = {};

async function loadProfile() {
  const { data } = await window.labApi.apiFetch("/profile");
  currentUserInfo = {
    firstName: data.user.firstName,
    lastName: data.user.lastName,
    email: data.user.email,
    phone: data.user.phone || "",
    role: data.user.role,
  };
  fillInfoForm();
}

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
  firstNameField.value = currentUserInfo.firstName;
  lastNameField.value = currentUserInfo.lastName;
  emailField.value = currentUserInfo.email;
  emailField.readOnly = true;
  phoneField.value = currentUserInfo.phone || "";
  roleField.value = currentUserInfo.role;
}

infoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideStatus(infoStatus);
  try {
    const { data } = await window.labApi.apiFetch("/profile", {
      method: "PUT",
      body: {
        firstName: firstNameField.value.trim(),
        lastName: lastNameField.value.trim(),
        phone: phoneField.value.trim(),
      },
    });
    currentUserInfo = { ...currentUserInfo, ...data.user };
    showStatus(infoStatus, "Account info saved.", "success");
  } catch (err) {
    showStatus(infoStatus, err.message || "Save failed.", "error");
  }
});

passwordForm.addEventListener("submit", async (e) => {
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
  try {
    await window.labApi.apiFetch("/profile/password", {
      method: "POST",
      body: { currentPassword: current, newPassword: next },
    });
    passwordForm.reset();
    showStatus(passwordStatus, "Password updated.", "success");
  } catch (err) {
    showStatus(passwordStatus, err.message || "Password update failed.", "error");
  }
});

const resetForm = document.getElementById("resetForm");
const resetStatus = document.getElementById("resetStatus");
const sendCodeBtn = document.getElementById("sendCodeBtn");

if (resetForm) {
  resetForm.style.opacity = "0.6";
  resetForm.querySelectorAll("input, select, button").forEach((el) => { el.disabled = true; });
}
if (sendCodeBtn) {
  sendCodeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showStatus(
      resetStatus,
      "Password reset by verification code is not available (no email/SMS delivery). Contact an Admin.",
      "error",
    );
  });
}

(async function initProfilePage() {
  await window.labAuthReady;
  await loadProfile();
})();