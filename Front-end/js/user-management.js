// User Management page — placeholder data only, not connected to the real database yet.
// Once Jaden's API is ready, swap the mock `users` array + localStorage below for real fetch() calls
// to the Users/Roles tables (UserID, FirstName, LastName, Email, Phone, RoleID, IsActive).

let users = [
  { id: 1, firstName: "Deep", lastName: "Patel", email: "deep.patel@example.edu", phone: "814-555-0101", role: "Admin", active: true, created: "2026-09-02" },
  { id: 2, firstName: "Beau", lastName: "Smith", email: "beau.smith@example.edu", phone: "814-555-0102", role: "Admin", active: true, created: "2026-09-02" },
  { id: 3, firstName: "Jaden", lastName: "Lee", email: "jaden.lee@example.edu", phone: "814-555-0103", role: "Admin", active: true, created: "2026-09-02" },
  { id: 4, firstName: "Sam", lastName: "Rivera", email: "sam.rivera@example.edu", phone: "814-555-0104", role: "Student Worker", active: false, created: "2026-10-01" },
  { id: 5, firstName: "Andrii", lastName: "Varlamov", email: "andrii.varlamov@example.edu", phone: "814-555-0105", role: "Admin", active: true, created: "2026-09-02" },
];

let nextId = 6;
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

function toggleActive(id) {
  const user = users.find((u) => u.id === id);
  if (user) {
    user.active = !user.active;
    renderTable();
    showNotice(`${user.firstName} ${user.lastName} ${user.active ? "unblocked" : "blocked"}.`, "success");
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

userForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = userIdField.value ? Number(userIdField.value) : null;

  const password = passwordField.value;

  if (id) {
    const user = users.find((u) => u.id === id);
    if (user) {
      user.firstName = firstNameField.value.trim();
      user.lastName = lastNameField.value.trim();
      user.email = emailField.value.trim();
      user.phone = phoneField.value.trim();
      user.role = roleField.value;
      if (password) {
        // TODO: PUT /api/users/:id/password (or similar) with the new password.
        // Do not store it on the local `user` object.
      }
    }
    closeUserModal();
    renderTable();
    showNotice("User updated.", "success");
  } else {
    users.push({
      id: nextId++,
      firstName: firstNameField.value.trim(),
      lastName: lastNameField.value.trim(),
      email: emailField.value.trim(),
      phone: phoneField.value.trim(),
      role: roleField.value,
      active: true,
      created: new Date().toISOString().slice(0, 10),
      // TODO: POST password to the create-user endpoint; not stored in this mock object.
    });
    closeUserModal();
    renderTable();
    showNotice("User added.", "success");
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

document.getElementById("deleteConfirmBtn").addEventListener("click", () => {
  if (deleteTargetId !== null) {
    const user = users.find((u) => u.id === deleteTargetId);
    users = users.filter((u) => u.id !== deleteTargetId);
    renderTable();
    showNotice(`${user ? user.firstName + " " + user.lastName : "User"} deleted.`, "success");
  }
  closeDeleteModal();
});

document.getElementById("deleteCancelBtn").addEventListener("click", closeDeleteModal);
document.getElementById("addUserBtn").addEventListener("click", openAddModal);
document.getElementById("cancelBtn").addEventListener("click", closeUserModal);
searchInput.addEventListener("input", renderTable);
roleFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);

renderTable();