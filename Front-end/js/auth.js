// auth.js — shared login/session helper, included before every page's own script.
// Placeholder-only: ACCOUNTS below stands in for the real Users table + login API.
// Once the backend exists, swap ACCOUNTS + checkLogin() for a real POST /api/login call,
// and swap localStorage for whatever session/token strategy the API ends up using.

const ACCOUNTS = [
  { email: "deep.patel@example.edu", password: "password123", firstName: "Deep", lastName: "Patel", role: "Admin" },
  { email: "beau.smith@example.edu", password: "password123", firstName: "Beau", lastName: "Smith", role: "Full-time Lab Worker" },
  { email: "sam.rivera@example.edu", password: "password123", firstName: "Sam", lastName: "Rivera", role: "Student Worker" },
];

function checkLogin(email, password) {
  return ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
  ) || null;
}

function getCurrentUser() {
  const raw = localStorage.getItem("currentUser");
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(account) {
  const { password, ...safeUser } = account; // never keep the password in storage
  localStorage.setItem("currentUser", JSON.stringify(safeUser));
}

function logout() {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}

// Call at the top of every protected page's JS. Sends you back to login if nobody's logged in.
function requireLogin() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// Call right after requireLogin() on every protected page. Adds the logged-in name + a
// Logout button to the sidebar, and hides nav links this role shouldn't see.
// NOTE: this only hides the link in the UI — it is NOT real access control. Once there's
// a backend, the server must also check the role before returning data, since anyone
// can still open user-management.html directly by typing the URL.
function initSidebarForRole(user) {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  // Current rule (placeholder — easy to change later): only Admin sees User Management.
  if (user.role !== "Admin") {
    sidebar.querySelectorAll('a[href="user-management.html"], a[href="users.html"]').forEach((link) => {
      link.closest("li").style.display = "none";
    });
  }

  const footer = document.createElement("div");
  footer.className = "sidebar-footer";
  footer.innerHTML = `
    <p class="sidebar-user">${user.firstName} ${user.lastName}<br><span>${user.role}</span></p>
    <button id="logoutBtn" class="btn-logout">Log Out</button>
  `;
  sidebar.appendChild(footer);
  document.getElementById("logoutBtn").addEventListener("click", logout);
}