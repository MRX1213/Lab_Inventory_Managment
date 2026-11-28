// Supply Requests — SQL Server via /api.

let spaces = [];
let locations = [];
let items = [];
let requests = [];
let requestSummary = { pending: 0, approved: 0, rejected: 0 };

async function loadSupplyPageData() {
  const [ar, it, req] = await Promise.all([
    window.labApi.apiFetch("/areas"),
    window.labApi.apiFetch("/items?stock=all"),
    window.labApi.apiFetch("/requests"),
  ]);
  locations = ar.data.areas.map((a) => ({
    id: a.areaId,
    spaceId: a.spaceId,
    name: a.areaName,
    displayLabel: a.displayLabel,
  }));
  spaces = [...new Set(locations.map((l) => l.spaceId))]; // minimal
  items = it.data.items.map((i) => ({
    id: i.itemId,
    name: i.itemName,
    locationId: i.areaId,
  }));
  requestSummary = req.data.summary || requestSummary;
  requests = req.data.requests.map((r) => ({
    id: r.requestId,
    itemId: r.itemId,
    newItemName: r.newItemName || "",
    targetAreaId: r.targetAreaId,
    qty: r.requestedQuantity,
    reason: r.reason,
    requestedBy: r.requestedByEmail || String(r.requestedById),
    createdAt: r.createdAt,
    status: r.status,
    decidedBy: r.decidedByEmail || "",
    decisionNotes: r.decisionNotes || "",
    decidedAt: r.decidedAt || "",
    rowVersion: r.rowVersion,
  }));
}
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

const findUser = (email) => ({ email, name: email ? email.split("@")[0] : "Unknown" });

function itemName(request) {
  if (request.itemId === null) return request.newItemName;
  const item = items.find((i) => i.id === request.itemId);
  return item ? item.name : "(deleted item)";
}

// "Makerspace - Shelf"
function locationName(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return "";
  return loc.displayLabel || loc.name;
}

// right now, as a UTC ISO string (the backend will set this later)
const now = () => new Date().toISOString();

// ---------- who is logged in (from js/current-user.js) ----------

let currentEmail = "";
let canReview = false;

// ---------- cards + table ----------

// student workers only see their own requests
const visibleRequests = () => requests.filter((r) => canReview || r.requestedBy === currentEmail);

function renderCards() {
  document.getElementById("pending-count").textContent = String(requestSummary.pending ?? 0);
  document.getElementById("approved-count").textContent = String(requestSummary.approved ?? 0);
  document.getElementById("rejected-count").textContent = String(requestSummary.rejected ?? 0);
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

requestForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return;

  const isNew = requestType() === "new";
  const newName = newItemField.value.trim();
  const qty = Number(qtyField.value);
  const reason = reasonField.value.trim();

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

  submitting = true;
  requestSubmitBtn.disabled = true;
  requestSubmitBtn.textContent = "Submitting...";

  try {
    const body = {
      requestedQuantity: qty,
      reason,
      targetAreaId,
      ...(isNew
        ? { newItemName: newName }
        : { itemId: Number(requestItemField.value) }),
    };
    await window.labApi.apiFetch("/requests", { method: "POST", body });
    await loadSupplyPageData();
    closeRequestModal();
    renderTable();
    showNotice("Request submitted. It shows as Pending until someone reviews it.", "success");
  } catch (err) {
    requestError.textContent = err.message || "Submit failed.";
    requestError.style.display = "block";
  } finally {
    submitting = false;
    requestSubmitBtn.disabled = false;
    requestSubmitBtn.textContent = "Submit request";
  }
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

document.getElementById("decision-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!decision) return;
  const r = requests.find((req) => req.id === decision.id);
  try {
    await window.labApi.apiFetch(`/requests/${decision.id}/decision`, {
      method: "PATCH",
      body: {
        status: decision.status,
        decisionNotes: decisionNotesField.value.trim(),
        rowVersion: r.rowVersion,
      },
    });
    await loadSupplyPageData();
    renderTable();
    showNotice(`${decision.status} request #${r.id}.`, "success");
    closeDecisionModal();
  } catch (err) {
    showNotice(err.message || "Decision failed.", "error");
  }
});

// ---------- refresh ----------
// reloads the requests so changes made by someone else show up
// (on the Refresh button, when coming back to this tab, and when coming back to this page)

function isPopupOpen() {
  return requestModal.style.display === "flex" || decisionModal.style.display === "flex";
}

async function refreshRequests() {
  try {
    await loadSupplyPageData();
    renderTable();
    lastUpdated.textContent = `Updated ${formatDateTime(now())}`;
  } catch (e) {
    showNotice(e.message || "Refresh failed.", "error");
  }
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

document.getElementById("new-request-btn").addEventListener("click", openRequestModal);
document.getElementById("request-cancel-btn").addEventListener("click", closeRequestModal);
document.getElementById("decision-cancel-btn").addEventListener("click", closeDecisionModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeRequestModal(); closeDecisionModal(); }
});
searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);

(async function initSupplyPage() {
  await window.labAuthReady;
  currentEmail = currentUser.email;
  canReview = hasRole(ROLES.admin, ROLES.fullTime);
  if (!canReview) document.querySelector("th.reviewer-only")?.remove();
  if (canReview) statusFilter.value = "Pending";
  await refreshRequests();
})();
