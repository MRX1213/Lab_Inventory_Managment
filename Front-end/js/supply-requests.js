// Supply Requests page — placeholder data only, not connected to the real database yet.
// Everyone can make requests and see their own. Admins and full-time lab workers
// see everyone's and can approve or reject them.

// same sample items as the inventory page (will come from /api/items later)
let items = [
  { id: 1, name: "PLA Black" },
  { id: 2, name: "ABS Red" },
  { id: 3, name: "Nozzle 0.4mm" },
  { id: 4, name: "AA Batteries" },
  { id: 5, name: "HDMI Cable 6ft" },
  { id: 6, name: "Plywood Sheet" },
  { id: 7, name: "2x4 Softwood" },
  { id: 8, name: "Safety Glasses" },
];

// names for the sample requests (will come from the Users table later)
let users = [
  { email: "student@lab.edu", name: "Test Student", role: "Student Worker" },
  { email: "fulltime@lab.edu", name: "Test Worker", role: "Full-time Lab Worker" },
  { email: "admin@lab.edu", name: "Test Admin", role: "Admin" },
  { email: "jmiller@lab.edu", name: "Jordan Miller", role: "Student Worker" },
];

// itemId null = they asked for something new (newItemName)
let requests = [
  { id: 1, itemId: 2, newItemName: "", qty: 5, reason: "Two big prints coming up",
    requestedBy: "student@lab.edu", createdAt: "2026-10-12T14:20", status: "Pending",
    decidedBy: "", decisionNotes: "", decidedAt: "" },
  { id: 2, itemId: null, newItemName: "Wood glue (16 oz)", qty: 2, reason: "None in the project room",
    requestedBy: "jmiller@lab.edu", createdAt: "2026-10-10T10:05", status: "Approved",
    decidedBy: "fulltime@lab.edu", decisionNotes: "Ordering with the next batch", decidedAt: "2026-10-11T09:00" },
  { id: 3, itemId: 5, newItemName: "", qty: 6, reason: "Arduino workshop next week",
    requestedBy: "student@lab.edu", createdAt: "2026-10-08T16:40", status: "Rejected",
    decidedBy: "admin@lab.edu", decisionNotes: "We can borrow some from the CS lab", decidedAt: "2026-10-09T08:30" },
  { id: 4, itemId: 4, newItemName: "", qty: 24, reason: "",
    requestedBy: "fulltime@lab.edu", createdAt: "2026-10-14T11:15", status: "Pending",
    decidedBy: "", decisionNotes: "", decidedAt: "" },
];

let nextId = 100;
let decision = null;   // { id, status } while the approve/reject popup is open

// ---------- page elements ----------

const pageNotice = document.getElementById("page-message");
const tableBody = document.getElementById("request-table-body");
const emptyState = document.getElementById("empty-state");
const tableTitle = document.getElementById("table-title");
const searchInput = document.getElementById("search-box");
const statusFilter = document.getElementById("filter-status");

const requestModal = document.getElementById("request-modal");
const requestForm = document.getElementById("request-form");
const requestItemField = document.getElementById("request-item");
const newItemField = document.getElementById("request-new-name");
const qtyField = document.getElementById("request-qty");
const reasonField = document.getElementById("request-reason");
const existingItemBox = document.getElementById("existing-item-field");
const newItemBox = document.getElementById("new-item-field");
const requestError = document.getElementById("request-error");

const decisionModal = document.getElementById("decision-modal");
const decisionTitle = document.getElementById("decision-title");
const decisionNotesField = document.getElementById("decision-notes");
const decisionSaveBtn = document.getElementById("decision-save-btn");

// ---------- helpers ----------

// makes typed-in text safe to put inside innerHTML (so "<b>" shows as text, not HTML)
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showNotice(message, type) {
  pageNotice.textContent = message;
  pageNotice.className = `notice notice--${type}`;
  pageNotice.style.display = "block";
  clearTimeout(showNotice._t);
  showNotice._t = setTimeout(() => { pageNotice.style.display = "none"; }, 4000);
}

const findUser = (email) => users.find((u) => u.email === email) || { email, name: email, role: "Student Worker" };

function itemName(request) {
  if (request.itemId === null) return request.newItemName;
  const item = items.find((i) => i.id === request.itemId);
  return item ? item.name : "(deleted item)";
}

// "Oct 14, 11:15 AM"
const formatDate = (text) =>
  new Date(text).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// right now, in the same format as the sample data
function now() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ---------- who is logged in (from js/current-user.js) ----------

const currentEmail = currentUser.email;
const canReview = hasRole(ROLES.admin, ROLES.fullTime);

// ---------- cards + table ----------

// student workers only see their own requests
const visibleRequests = () => requests.filter((r) => canReview || r.requestedBy === currentEmail);

function renderCards() {
  const count = (status) => visibleRequests().filter((r) => r.status === status).length;
  document.getElementById("pending-count").textContent = count("Pending");
  document.getElementById("approved-count").textContent = count("Approved");
  document.getElementById("rejected-count").textContent = count("Rejected");
}

function renderTable() {
  renderCards();
  const search = searchInput.value.trim().toLowerCase();
  const statusVal = statusFilter.value;

  const filtered = visibleRequests()
    .filter((r) => {
      const matchesSearch = !search ||
        itemName(r).toLowerCase().includes(search) ||
        findUser(r.requestedBy).name.toLowerCase().includes(search);
      const matchesStatus = statusVal === "all" || r.status === statusVal;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first

  tableBody.innerHTML = "";
  emptyState.textContent = visibleRequests().length === 0
    ? "No requests yet. Click + New request when the lab needs something."
    : "No requests match these filters.";
  emptyState.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((r) => {
    const decided = r.status !== "Pending";
    const decisionText = decided
      ? `${escapeHtml(r.decisionNotes || "No notes")}
         <span class="small-text">${escapeHtml(findUser(r.decidedBy).name)}, ${formatDate(r.decidedAt)}</span>`
      : "Waiting for review";

    // approve / reject buttons (reviewers only, pending only)
    let actions = "";
    if (canReview) {
      actions = `<td>${decided ? "" : `
        <div class="row-actions">
          <button type="button" class="action-btn" data-action="approve" data-id="${r.id}">Approve</button>
          <button type="button" class="action-btn action-btn--danger" data-action="reject" data-id="${r.id}">Reject</button>
        </div>`}</td>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${escapeHtml(itemName(r))}${r.itemId === null ? '<span class="small-text">New item</span>' : ""}</td>
      <td>${r.qty}</td>
      <td>${escapeHtml(findUser(r.requestedBy).name)}<span class="small-text">${formatDate(r.createdAt)}</span></td>
      <td class="reason">${escapeHtml(r.reason || "-")}</td>
      <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
      <td>${decisionText}</td>
      ${actions}
    `;
    tableBody.appendChild(tr);
  });

  tableTitle.textContent = canReview ? "All requests" : "My requests";
}

tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.dataset.action === "approve") openDecisionModal(id, "Approved");
  if (btn.dataset.action === "reject") openDecisionModal(id, "Rejected");
});

// ---------- new request popup ----------

const requestType = () => document.querySelector("input[name='request-type']:checked").value;

// show the item dropdown OR the new item box, depending on the radio picked
function updateRequestType() {
  const isNew = requestType() === "new";
  existingItemBox.style.display = isNew ? "none" : "block";
  newItemBox.style.display = isNew ? "block" : "none";
}

document.querySelectorAll("input[name='request-type']").forEach((radio) => {
  radio.addEventListener("change", updateRequestType);
});

function openRequestModal() {
  requestForm.reset();
  requestError.style.display = "none";
  // items sorted A-Z
  requestItemField.innerHTML = [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`)
    .join("");
  updateRequestType();
  requestModal.style.display = "flex";
  requestItemField.focus();
}

function closeRequestModal() {
  requestModal.style.display = "none";
}

requestForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const isNew = requestType() === "new";
  const newName = newItemField.value.trim();
  const qty = Number(qtyField.value);

  // check the form before saving
  let error = "";
  if (isNew && !newName) error = "Type the name of the item you need.";
  else if (!Number.isInteger(qty) || qty < 1) error = "Quantity has to be a whole number, 1 or more.";
  if (error) {
    requestError.textContent = error;
    requestError.style.display = "block";
    return;
  }

  // TODO: POST /api/requests
  requests.push({
    id: nextId++,
    itemId: isNew ? null : Number(requestItemField.value),
    newItemName: isNew ? newName : "",
    qty,
    reason: reasonField.value.trim(),
    requestedBy: currentEmail,
    createdAt: now(),
    status: "Pending",
    decidedBy: "",
    decisionNotes: "",
    decidedAt: "",
  });

  closeRequestModal();
  renderTable();
  showNotice("Request submitted. It shows as Pending until someone reviews it.", "success");
});

// ---------- approve / reject popup ----------

function openDecisionModal(id, status) {
  const r = requests.find((req) => req.id === id);
  const verb = status === "Approved" ? "Approve" : "Reject";
  decision = { id, status };
  decisionTitle.textContent = `${verb} request #${r.id}: ${r.qty} x ${itemName(r)}?`;
  decisionSaveBtn.textContent = verb;
  decisionSaveBtn.className = status === "Approved" ? "btn-primary" : "btn-danger";
  decisionNotesField.value = "";
  decisionModal.style.display = "flex";
  decisionNotesField.focus();
}

function closeDecisionModal() {
  decisionModal.style.display = "none";
  decision = null;
}

document.getElementById("decision-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (decision) {
    // TODO: PUT /api/requests/:id with the status and notes
    const r = requests.find((req) => req.id === decision.id);
    r.status = decision.status;
    r.decidedBy = currentEmail;
    r.decisionNotes = decisionNotesField.value.trim();
    r.decidedAt = now();
    renderTable();
    showNotice(`${decision.status} request #${r.id}.`, "success");
  }
  closeDecisionModal();
});

// ---------- start ----------

// students don't get the Actions column
if (!canReview) document.querySelector("th.reviewer-only").remove();

// reviewers start on what still needs a decision
if (canReview) statusFilter.value = "Pending";

document.getElementById("new-request-btn").addEventListener("click", openRequestModal);
document.getElementById("request-cancel-btn").addEventListener("click", closeRequestModal);
document.getElementById("decision-cancel-btn").addEventListener("click", closeDecisionModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeRequestModal(); closeDecisionModal(); }
});
searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);

renderTable();