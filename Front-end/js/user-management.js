// User Management — Admin API.

let users = [];

async function loadUsers() {
  const { data } = await window.labApi.apiFetch("/admin/users");
  users = data.users.map((u) => ({
    id: u.userId,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone || "",
    role: u.role,
    active: u.isActive,
    created: u.createdAt || "—",
  }));
}
let deleteTargetId = null;

const tableBody = document.getElementById("userTableBody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");

const userModal = document.getElementById("userModal");
const modalTitle = document.getElementById("modalTitle");
const userForm = document.getElementById("userForm");
const userIdField = document.getElementById("userId");
const firstNameField = document.getElementById("firstName");
const lastNameField = document.getElementById("lastName");
const emailField = document.getElementById("email");
const phoneField = document.getElementById("phone");
const roleField = document.getElementById("role");
const passwordField = document.getElementById("password");
const passwordLabel = document.getElementById("passwordLabel");
const passwordHint = document.getElementById("passwordHint");

const deleteModal = document.getElementById("deleteModal");
const deleteMessage = document.getElementById("deleteMessage");

const saveNotice = document.getElementById("saveNotice");

function showNotice(message, type) {
  saveNotice.textContent = message;
  saveNotice.className = `notice notice--${type}`;
  saveNotice.style.display = "block";
  clearTimeout(showNotice._t);
  showNotice._t = setTimeout(() => { saveNotice.style.display = "none"; }, 4000);
}

function renderTable() {
  const search = searchInput.value.trim().toLowerCase();
  const roleVal = roleFilter.value;
  const statusVal = statusFilter.value;

  const filtered = users.filter((u) => {
    const fullName = (u.firstName + " " + u.lastName).toLowerCase();
    const matchesSearch = !search || fullName.includes(search) || u.email.toLowerCase().includes(search);
    const matchesRole = !roleVal || u.role === roleVal;
    const matchesStatus = !statusVal || (statusVal === "active" ? u.active : !u.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  tableBody.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.firstName} ${u.lastName}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td><span class="status-pill ${u.active ? "status-active" : "status-blocked"}">${u.active ? "Active" : "Blocked"}</span></td>
      <td>${u.created}</td>
      <td>
        <div class="row-actions">
          <button class="action-btn" data-action="edit" data-id="${u.id}">Edit</button>
          <button class="action-btn ${u.active ? "action-btn--warn" : "action-btn--ok"}" data-action="toggle" data-id="${u.id}">${u.active ? "Block" : "Unblock"}</button>
          <button class="action-btn action-btn--danger" data-action="delete" data-id="${u.id}">Delete</button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === "edit") openEditModal(id);
  if (action === "toggle") toggleActive(id);
  if (action === "delete") openDeleteModal(id);
});

async function toggleActive(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  try {
    await window.labApi.apiFetch(`/admin/users/${id}`, {
      method: "PUT",
      body: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: !user.active,
      },
    });
    await loadUsers();
    renderTable();
    showNotice(`${user.firstName} ${user.lastName} ${!user.active ? "unblocked" : "blocked"}.`, "success");
  } catch (err) {
    showNotice(err.message || "Update failed.", "error");
  }
}

function openAddModal() {
  modalTitle.textContent = "Add User";
  userForm.reset();
  userIdField.value = "";
  passwordField.required = true;
  passwordLabel.textContent = "Initial Password";
  passwordHint.textContent = "Set a starting password for this account. The user should change it after their first login.";
  userModal.style.display = "flex";
}

function openEditModal(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  modalTitle.textContent = "Edit User";
  userIdField.value = user.id;
  firstNameField.value = user.firstName;
  lastNameField.value = user.lastName;
  emailField.value = user.email;
  phoneField.value = user.phone || "";
  roleField.value = user.role;
  passwordField.value = "";
  passwordField.required = false;
  passwordLabel.textContent = "Reset Password (optional)";
  passwordHint.textContent = "Leave blank to keep the current password. Fill in only to set a new one.";
  userModal.style.display = "flex";
}

function closeUserModal() {
  userModal.style.display = "none";
}

userForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = userIdField.value ? Number(userIdField.value) : null;
  const password = passwordField.value;
  const body = {
    firstName: firstNameField.value.trim(),
    lastName: lastNameField.value.trim(),
    email: emailField.value.trim(),
    phone: phoneField.value.trim(),
    role: roleField.value,
    isActive: true,
    ...(password ? { password } : {}),
  };
  try {
    if (id) {
      const user = users.find((u) => u.id === id);
      await window.labApi.apiFetch(`/admin/users/${id}`, {
        method: "PUT",
        body: { ...body, isActive: user?.active !== false },
      });
      showNotice("User updated.", "success");
    } else {
      if (!password || password.length < 8) {
        showNotice("Initial password must be at least 8 characters.", "error");
        return;
      }
      await window.labApi.apiFetch("/admin/users", { method: "POST", body });
      showNotice("User added.", "success");
    }
    await loadUsers();
    closeUserModal();
    renderTable();
  } catch (err) {
    showNotice(err.message || "Save failed.", "error");
  }
});

function openDeleteModal(id) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  deleteTargetId = id;
  deleteMessage.textContent = `Are you sure you want to delete ${user.firstName} ${user.lastName}? This cannot be undone.`;
  deleteModal.style.display = "flex";
}

function closeDeleteModal() {
  deleteModal.style.display = "none";
  deleteTargetId = null;
}

document.getElementById("deleteConfirmBtn").addEventListener("click", async () => {
  if (deleteTargetId !== null) {
    const user = users.find((u) => u.id === deleteTargetId);
    try {
      await window.labApi.apiFetch(`/admin/users/${deleteTargetId}`, { method: "DELETE", body: {} });
      await loadUsers();
      renderTable();
      showNotice(`${user ? user.firstName + " " + user.lastName : "User"} deactivated.`, "success");
    } catch (err) {
      showNotice(err.message || "Delete failed.", "error");
    }
  }
  closeDeleteModal();
});

document.getElementById("deleteCancelBtn").addEventListener("click", closeDeleteModal);
document.getElementById("addUserBtn").addEventListener("click", openAddModal);
document.getElementById("cancelBtn").addEventListener("click", closeUserModal);
searchInput.addEventListener("input", renderTable);
roleFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);

(async function initUserManagement() {
  await window.labAuthReady;
  if (!hasRole(ROLES.admin)) {
    window.location.href = "dashboard.html";
    return;
  }
  try {
    await loadUsers();
    renderTable();
  } catch (e) {
    showNotice(e.message || "Load failed.", "error");
  }
})();