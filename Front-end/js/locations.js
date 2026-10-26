// Locations page — placeholder data only, not connected to the real database yet.
// Once the API is ready, swap the mock `locations` array below for real fetch() calls
// to the Locations table (LocationID, Space, Name). "itemCount" below is a placeholder
// for the count of inventory items assigned to this location — that join comes from
// the Inventory table once the teammate's Inventory page/API exists.

let locations = [
  { id: 1, space: "Makerspace", name: "Bench A", itemCount: 12, created: "2026-09-02" },
  { id: 2, space: "Makerspace", name: "Bench B", itemCount: 7, created: "2026-09-02" },
  { id: 3, space: "Project Room", name: "Storage Shelf 2", itemCount: 0, created: "2026-09-15" },
  { id: 4, space: "Makerspace", name: "3D Printing Cart", itemCount: 4, created: "2026-10-01" },
];

let nextId = 5;
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

locationForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = locationIdField.value ? Number(locationIdField.value) : null;

  if (id) {
    const loc = locations.find((l) => l.id === id);
    if (loc) {
      loc.space = spaceField.value;
      loc.name = nameField.value.trim();
    }
    closeLocationModal();
    renderTable();
    showNotice("Location updated.", "success");
  } else {
    locations.push({
      id: nextId++,
      space: spaceField.value,
      name: nameField.value.trim(),
      itemCount: 0,
      created: new Date().toISOString().slice(0, 10),
    });
    closeLocationModal();
    renderTable();
    showNotice("Location added.", "success");
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

document.getElementById("deleteConfirmBtn").addEventListener("click", () => {
  if (deleteTargetId !== null) {
    const loc = locations.find((l) => l.id === deleteTargetId);
    locations = locations.filter((l) => l.id !== deleteTargetId);
    renderTable();
    showNotice(`"${loc ? loc.name : "Location"}" deleted.`, "success");
  }
  closeDeleteModal();
});

document.getElementById("deleteCancelBtn").addEventListener("click", closeDeleteModal);
document.getElementById("addLocationBtn").addEventListener("click", openAddModal);
document.getElementById("cancelBtn").addEventListener("click", closeLocationModal);
searchInput.addEventListener("input", renderTable);
spaceFilter.addEventListener("change", renderTable);

renderTable();