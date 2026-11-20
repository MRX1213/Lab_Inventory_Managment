// Who is logged in — used by the Inventory and Supply Requests pages.
// Load it right before the page's own script:
//   <script src="js/current-user.js"></script>
//   <script src="js/inventory.js"></script>
//
// These pages read the logged-in user from sessionStorage "currentUser" as { name, email, role }.
// The login page should save that after a successful login.
// This only changes what the page shows. The backend still has to check roles itself.

const ROLES = {
  admin: "Admin",
  fullTime: "Full-time Lab Worker",
  student: "Student Worker",
};

// TEMPORARY: who to act as when nobody has logged in yet (until the login page works).
// change this to test the other layouts:  ROLES.admin, ROLES.fullTime, or ROLES.student
const TEST_ROLE = ROLES.student;

const testUsers = {
  [ROLES.admin]: { name: "Test Admin", email: "admin@lab.edu", role: ROLES.admin },
  [ROLES.fullTime]: { name: "Test Worker", email: "fulltime@lab.edu", role: ROLES.fullTime },
  [ROLES.student]: { name: "Test Student", email: "student@lab.edu", role: ROLES.student },
};

const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "null") || testUsers[TEST_ROLE];

// hasRole("Admin", "Full-time Lab Worker") -> true if the user is either one
const hasRole = (...roles) => roles.includes(currentUser.role);

// hide parts of the page by role, using data-roles in the HTML:
//   <section data-roles="Admin, Full-time Lab Worker">
document.querySelectorAll("[data-roles]").forEach((el) => {
  const allowed = el.dataset.roles.split(",").map((r) => r.trim());
  if (!hasRole(...allowed)) el.style.display = "none";
});

// User Management is admin only, so take its link out of the menu for everyone else
if (!hasRole(ROLES.admin)) {
  const link = document.querySelector('.sidebar a[href="user-management.html"]');
  if (link) link.closest("li").remove();
}

// who is logged in + Log Out, at the bottom of the sidebar
const sidebarUser = document.createElement("div");
sidebarUser.className = "sidebar-user";
sidebarUser.innerHTML = `
  <p class="sidebar-user-name"></p>
  <p class="sidebar-user-role"></p>
  <button type="button" class="btn-secondary" id="logout-btn">Log Out</button>
`;
sidebarUser.querySelector(".sidebar-user-name").textContent = currentUser.name;
sidebarUser.querySelector(".sidebar-user-role").textContent = currentUser.role;
document.querySelector(".sidebar").appendChild(sidebarUser);

document.getElementById("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem("currentUser");
  window.location.href = "login.html";
});