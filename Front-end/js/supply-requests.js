// Supply Requests page — placeholder data only, not connected to the real database yet.
// Everyone can make requests and see their own. Admins and full-time lab workers
// see everyone's and can approve or reject them.

// same sample spaces, locations, and items as the inventory page
// (will come from /api/spaces, /api/locations, and /api/items later)
let spaces = [
  { id: 1, name: "Makerspace" },
  { id: 2, name: "Project Room" },
];

let locations = [
  { id: 1, spaceId: 1, name: "3D Printer Area" },
  { id: 2, spaceId: 1, name: "Laser Cutter Area" },
  { id: 3, spaceId: 1, name: "Shelf" },
  { id: 4, spaceId: 2, name: "Shelf" },
  { id: 6, spaceId: 2, name: "Side Shelves" },
  { id: 5, spaceId: 2, name: "Wood Cutting Station" },
];

let items = [
  { id: 1, name: "PLA Black", locationId: 1 },
  { id: 2, name: "ABS Red", locationId: 1 },
  { id: 3, name: "Nozzle 0.4mm", locationId: 1 },
  { id: 4, name: "AA Batteries", locationId: 3 },
  { id: 5, name: "HDMI Cable 6ft", locationId: 3 },
  { id: 6, name: "Plywood Sheet", locationId: 2 },
  { id: 7, name: "2x4 Softwood", locationId: 5 },
  { id: 8, name: "Safety Glasses", locationId: 4 },
];

// names for the sample requests (will come from the Users table later)
let users = [
  { email: "student@lab.edu", name: "Test Student", role: "Student Worker" },
  { email: "fulltime@lab.edu", name: "Test Worker", role: "Full-time Lab Worker" },
  { email: "admin@lab.edu", name: "Test Admin", role: "Admin" },
  { email: "jmiller@lab.edu", name: "Jordan Miller", role: "Student Worker" },
];

// itemId null = they asked for something new (newItemName)
// targetAreaId = which location it's for (TargetAreaID in the database).
//   existing item: the item's own location. new item: picked by the person
// dates are UTC (the "Z" at the end) and shown in Eastern time by js/datetime-display.js
let requests = [
  { id: 1, itemId: 2, newItemName: "", targetAreaId: 1, qty: 5, reason: "Two big prints coming up",
    requestedBy: "student@lab.edu", createdAt: "2026-10-12T18:20:00Z", status: "Pending",
    decidedBy: "", decisionNotes: "", decidedAt: "" },
  { id: 2, itemId: null, newItemName: "Wood glue (16 oz)", targetAreaId: 5, qty: 2, reason: "None in the project room",
    requestedBy: "jmiller@lab.edu", createdAt: "2026-10-10T14:05:00Z", status: "Approved",
    decidedBy: "fulltime@lab.edu", decisionNotes: "Ordering with the next batch", decidedAt: "2026-10-11T13:00:00Z" },
  { id: 3, itemId: 5, newItemName: "", targetAreaId: 3, qty: 6, reason: "Arduino workshop next week",
    requestedBy: "student@lab.edu", createdAt: "2026-10-08T20:40:00Z", status: "Rejected",
    decidedBy: "admin@lab.edu", decisionNotes: "We can borrow some from the CS lab", decidedAt: "2026-10-09T12:30:00Z" },
  { id: 4, itemId: 4, newItemName: "", targetAreaId: 3, qty: 24, reason: "Restock for the soldering kits",
    requestedBy: "fulltime@lab.edu", createdAt: "2026-10-14T15:15:00Z", status: "Pending",
    decidedBy: "", decisionNotes: "", decidedAt: "" },
];

let nextId = 100;
let decision = null;   // { id, status } while the approve/reject popup is open
let submitting = false; // true while a request is being saved (stops double submits)

// ---------- page elements ----------

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
const requestSubmitBtn = document.getElementById("request-submit-btn");
const requestLocationField = document.getElementById("request-location");
const requestLocationHint = document.getElementById("request-location-hint");
const lastUpdated = document.getElementById("last-updated");

const decisionModal = document.getElementById("decision-modal");
const decisionTitle = document.getElementById("decision-title");
const decisionNotesField = document.getElementById("decision-notes");
const decisionSaveBtn = document.getElementById("decision-save-btn");

// ---------- helpers ----------

// escapeHtml() and showNotice() come from js/notices.js

const findUser = (email) => users.find((u) => u.email === email) || { email, name: email, role: "Student Worker" };

function itemName(request) {
  if (request.itemId === null) return request.newItemName;
  const item = items.find((i) => i.id === request.itemId);
  return item ? item.name : "(deleted item)";
}

// "Makerspace - Shelf"
function locationName(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return "";
  return spaces.find((s) => s.id === loc.spaceId).name + " - " + loc.name;
}

// right now, as a UTC ISO string (the backend will set this later)
const now = () => new Date().toISOString();

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
         <span class="small-text">${escapeHtml(findUser(r.decidedBy).name)}, ${formatDateTime(r.decidedAt)}</span>`
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
      <td>${escapeHtml(locationName(r.targetAreaId))}</td>
      <td>${r.qty}</td>
      <td>${escapeHtml(findUser(r.requestedBy).name)}<span class="small-text">${formatDateTime(r.createdAt)}</span></td>
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

// show the item dropdown OR the new item box, depending on the radio picked.
// existing item: the location is the item's own, so it's shown but can't be changed.
// new item: the person picks the location
function updateRequestType() {
  const isNew = requestType() === "new";
  existingItemBox.style.display = isNew ? "none" : "block";
  newItemBox.style.display = isNew ? "block" : "none";
  requestLocationField.disabled = !isNew;
  if (isNew) {
    requestLocationHint.textContent = "Where should the new item go?";
  } else {
    const item = items.find((i) => i.id === Number(requestItemField.value));
    if (item) requestLocationField.value = item.locationId;
    requestLocationHint.textContent = "Uses the item's location.";
  }
}

// switching between "existing" and "new" clears the field that's being hidden,
// so a half-typed name or an old pick doesn't get sent by accident
document.querySelectorAll("input[name='request-type']").forEach((radio) => {
  radio.addEventListener("change", () => {
    if (requestType() === "new") {
      requestItemField.selectedIndex = 0;
      requestLocationField.selectedIndex = 0;
    } else {
      newItemField.value = "";
    }
    updateRequestType();
  });
});

// picking a different item updates the location shown
requestItemField.addEventListener("change", updateRequestType);

function openRequestModal() {
  requestForm.reset();
  requestError.style.display = "none";
  // items sorted A-Z
  requestItemField.innerHTML = [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`)
    .join("");
  requestLocationField.innerHTML = locations
    .map((l) => `<option value="${l.id}">${escapeHtml(locationName(l.id))}</option>`)
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
  if (submitting) return; // already saving, ignore extra clicks

  const isNew = requestType() === "new";
  const newName = newItemField.value.trim();
  const qty = Number(qtyField.value);
  const reason = reasonField.value.trim();

  // check the form before saving
  let error = "";
  const targetAreaId = Number(requestLocationField.value);
  if (isNew && !newName) error = "Type the name of the item you need.";
  else if (!targetAreaId) error = "Pick a location for the request.";
  else if (!Number.isInteger(qty) || qty < 1) error = "Quantity has to be a whole number, 1 or more.";
  else if (!reason) error = "Add a reason for the request.";
  if (error) {
    requestError.textContent = error;
    requestError.style.display = "block";
    return;
  }

  // turn the button off while saving.
  // TODO: POST /api/requests. When that's a fetch(), turn the button back on in .finally(),
  // and only close the popup if it worked (keep the form filled in if it failed)
  submitting = true;
  requestSubmitBtn.disabled = true;
  requestSubmitBtn.textContent = "Submitting...";

  requests.push({
    id: nextId++,
    itemId: isNew ? null : Number(requestItemField.value),
    newItemName: isNew ? newName : "",
    targetAreaId,
    qty,
    reason,
    requestedBy: currentEmail,
    createdAt: now(),
    status: "Pending",
    decidedBy: "",
    decisionNotes: "",
    decidedAt: "",
  });

  submitting = false;
  requestSubmitBtn.disabled = false;
  requestSubmitBtn.textContent = "Submit request";

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

// ---------- refresh ----------
// reloads the requests so changes made by someone else show up
// (on the Refresh button, when coming back to this tab, and when coming back to this page)

function isPopupOpen() {
  return requestModal.style.display === "flex" || decisionModal.style.display === "flex";
}

function refreshRequests() {
  // TODO: GET /api/requests, then put the results in `requests` before rendering
  renderTable();
  lastUpdated.textContent = `Updated ${formatDateTime(now())}`;
}

document.getElementById("refresh-btn").addEventListener("click", refreshRequests);

// coming back to this tab (don't refresh while a popup is open, so nothing gets wiped)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !isPopupOpen()) refreshRequests();
});

// coming back to this page with the browser's Back button
window.addEventListener("pageshow", (e) => {
  if (e.persisted) refreshRequests();
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

refreshRequests();
