// Session + sidebar for protected pages. Requires config.js and api-client.js before this script.

const ROLES = {
  admin: "Admin",
  fullTime: "Full-time Lab Worker",
  student: "Student Worker",
};

let currentUser = null;
let sessionLoaded = false;

const hasRole = (...roles) => currentUser && roles.includes(currentUser.role);

function applyRoleUi() {
  if (!currentUser) return;
  document.querySelectorAll("[data-roles]").forEach((el) => {
    const allowed = el.dataset.roles.split(",").map((r) => r.trim());
    if (!hasRole(...allowed)) el.style.display = "none";
  });
  if (!hasRole(ROLES.admin)) {
    const link = document.querySelector('.sidebar a[href="user-management.html"]');
    if (link) link.closest("li")?.remove();
  }
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.getElementById("logout-btn")) return;
  const sidebarFooter = document.createElement("div");
  sidebarFooter.className = "sidebar-footer";
  sidebarFooter.innerHTML = `
    <p class="sidebar-user">${currentUser.firstName} ${currentUser.lastName} <span>${currentUser.role}</span></p>
    <button type="button" class="btn-logout" id="logout-btn">Log Out</button>
  `;
  sidebar.appendChild(sidebarFooter);
  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await window.labApi.apiFetch("/auth/logout", { method: "POST", body: {} });
    } catch {
      /* still redirect */
    }
    sessionStorage.removeItem("displayUser");
    window.location.href = "login.html";
  });
}

async function loadSession() {
  if (window.USE_MOCK_API) {
    const testUsers = {
      [ROLES.admin]: { userId: 1, firstName: "Test", lastName: "Admin", email: "admin@lab.edu", role: ROLES.admin },
      [ROLES.fullTime]: { userId: 2, firstName: "Test", lastName: "Worker", email: "fulltime@lab.edu", role: ROLES.fullTime },
      [ROLES.student]: { userId: 3, firstName: "Test", lastName: "Student", email: "student@lab.edu", role: ROLES.student },
    };
    currentUser = testUsers[ROLES.admin];
    sessionLoaded = true;
    applyRoleUi();
    return;
  }
  try {
    const { data } = await window.labApi.apiFetch("/auth/me");
    window.labApi.setCsrfToken(data.csrfToken);
    currentUser = {
      userId: data.user.userId,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      email: data.user.email,
      phone: data.user.phone,
      role: data.user.role,
    };
    sessionStorage.setItem("displayUser", JSON.stringify(currentUser));
    sessionLoaded = true;
    applyRoleUi();
  } catch {
    window.location.href = "login.html";
  }
}

window.labAuthReady = loadSession();