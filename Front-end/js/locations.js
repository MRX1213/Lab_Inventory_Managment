// Locations (Areas) — SQL Server via /api.

let locations = [];
const spaceById = new Map();
const spaceByName = new Map();

async function loadLocations() {
  const [{ data: sp }, { data: ar }] = await Promise.all([
    window.labApi.apiFetch("/spaces"),
    window.labApi.apiFetch("/areas"),
  ]);
  spaceById.clear();
  spaceByName.clear();
  sp.spaces.forEach((s) => {
    spaceById.set(s.spaceId, s.spaceName);
    spaceByName.set(s.spaceName, s.spaceId);
  });
  locations = ar.areas.map((a) => ({
    id: a.areaId,
    spaceId: a.spaceId,
    space: spaceById.get(a.spaceId) || "",
    name: a.areaName,
    itemCount: a.itemCount ?? 0,
    created: "—",
  }));
}
let deleteTargetId = null;

const tableBody = document.getElementById("locationTableBody");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const spaceFilter = document.getElementById("spaceFilter");
const saveNotice = document.getElementById("saveNotice");

const locationModal = document.getElementById("locationModal");
const modalTitle = document.getElementById("modalTitle");
const locationForm = document.getElementById("locationForm");
const locationIdField = document.getElementById("locationId");
const spaceField = document.getElementById("space");
const nameField = document.getElementById("name");

const deleteModal = document.getElementById("deleteModal");
const deleteMessage = document.getElementById("deleteMessage");
const deleteWarning = document.getElementById("deleteWarning");

function showNotice(message, type) {
  saveNotice.textContent = message;
  saveNotice.className = `notice notice--${type}`;
  saveNotice.style.display = "block";
  clearTimeout(showNotice._t);
  showNotice._t = setTimeout(() => { saveNotice.style.display = "none"; }, 4000);
}

function renderTable() {
  const search = searchInput.value.trim().toLowerCase();
  const spaceVal = spaceFilter.value;

  const filtered = locations.filter((loc) => {
    const matchesSearch = !search || loc.name.toLowerCase().includes(search);
    const matchesSpace = !spaceVal || loc.space === spaceVal;
    return matchesSearch && matchesSpace;
  });

  tableBody.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((loc) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${loc.space}</td>
      <td>${loc.name}</td>
      <td>${loc.itemCount}</td>
      <td>${loc.created}</td>
      <td>
        <div class="row-actions">
          <button class="action-btn" data-action="edit" data-id="${loc.id}">Edit</button>
          <button class="action-btn action-btn--danger" data-action="delete" data-id="${loc.id}">Delete</button>
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
  if (action === "delete") openDeleteModal(id);
});

function openAddModal() {
  modalTitle.textContent = "Add Location";
  locationForm.reset();
  locationIdField.value = "";
  locationModal.style.display = "flex";
}

function openEditModal(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return;
  modalTitle.textContent = "Edit Location";
  locationIdField.value = loc.id;
  spaceField.value = loc.space;
  nameField.value = loc.name;
  locationModal.style.display = "flex";
}

function closeLocationModal() {
  locationModal.style.display = "none";
}

locationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = locationIdField.value ? Number(locationIdField.value) : null;
  const spaceId = spaceByName.get(spaceField.value);
  const areaName = nameField.value.trim();
  try {
    if (id) {
      await window.labApi.apiFetch(`/areas/${id}`, { method: "PUT", body: { areaName } });
      showNotice("Location updated.", "success");
    } else {
      await window.labApi.apiFetch("/areas", { method: "POST", body: { spaceId, areaName } });
      showNotice("Location added.", "success");
    }
    await loadLocations();
    closeLocationModal();
    renderTable();
  } catch (err) {
    showNotice(err.message || "Save failed.", "error");
  }
});

function openDeleteModal(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return;
  deleteTargetId = id;
  deleteMessage.textContent = `Are you sure you want to delete "${loc.name}"? This cannot be undone.`;
  deleteWarning.style.display = loc.itemCount > 0 ? "block" : "none";
  deleteModal.style.display = "flex";
}

function closeDeleteModal() {
  deleteModal.style.display = "none";
  deleteTargetId = null;
}

document.getElementById("deleteConfirmBtn").addEventListener("click", async () => {
  if (deleteTargetId !== null) {
    const loc = locations.find((l) => l.id === deleteTargetId);
    try {
      await window.labApi.apiFetch(`/areas/${deleteTargetId}`, { method: "DELETE", body: {} });
      await loadLocations();
      renderTable();
      showNotice(`"${loc ? loc.name : "Location"}" deleted.`, "success");
    } catch (err) {
      showNotice(err.message || "Delete failed.", "error");
    }
  }
  closeDeleteModal();
});

document.getElementById("deleteCancelBtn").addEventListener("click", closeDeleteModal);
document.getElementById("addLocationBtn").addEventListener("click", openAddModal);
document.getElementById("cancelBtn").addEventListener("click", closeLocationModal);
searchInput.addEventListener("input", renderTable);
spaceFilter.addEventListener("change", renderTable);

(async function initLocationsPage() {
  await window.labAuthReady;
  try {
    await loadLocations();
    renderTable();
  } catch (e) {
    showNotice(e.message || "Load failed.", "error");
  }
})();