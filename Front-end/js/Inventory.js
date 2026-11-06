// Inventory page — placeholder data only, not connected to the real database yet.
// Once the API is ready, swap the mock arrays below for fetch() calls to the
// Spaces, Areas (locations), Categories (groups), and Items tables.

let spaces = [
  { id: 1, name: "Makerspace" },
  { id: 2, name: "Project Room" },
];

let locations = [
  { id: 1, spaceId: 1, name: "3D Printer Area" },
  { id: 2, spaceId: 1, name: "Laser Cutter Area" },
  { id: 3, spaceId: 1, name: "Shelf" },
  { id: 4, spaceId: 2, name: "Shelf" },
  { id: 5, spaceId: 2, name: "Wood Cutting Station" },
];

// parentId null = group, otherwise it's a subgroup of that group
let groups = [
  { id: 1, parentId: null, name: "Filament" },
  { id: 2, parentId: null, name: "Printer Parts" },
  { id: 3, parentId: null, name: "Batteries" },
  { id: 4, parentId: null, name: "Cables" },
  { id: 5, parentId: 4, name: "HDMI" },
  { id: 6, parentId: 4, name: "USB" },
  { id: 7, parentId: null, name: "Wood" },
  { id: 8, parentId: 7, name: "Plywood" },
  { id: 9, parentId: 7, name: "Softwood" },
  { id: 10, parentId: null, name: "Safety Gear" },
];

// reorderLevel = at or below this counts as low stock (null = not set)
let items = [
  { id: 1, name: "PLA Black", groupId: 1, locationId: 1, qty: 12, reorderLevel: 4, notes: "1.75mm spools" },
  { id: 2, name: "ABS Red", groupId: 1, locationId: 1, qty: 2, reorderLevel: 3, notes: "" },
  { id: 3, name: "Nozzle 0.4mm", groupId: 2, locationId: 1, qty: 0, reorderLevel: 2, notes: "" },
  { id: 4, name: "AA Batteries", groupId: 3, locationId: 3, qty: 3, reorderLevel: 10, notes: "" },
  { id: 5, name: "HDMI Cable 6ft", groupId: 5, locationId: 3, qty: 5, reorderLevel: 2, notes: "" },
  { id: 6, name: "Plywood Sheet", groupId: 8, locationId: 2, qty: 15, reorderLevel: 5, notes: "1/8 in" },
  { id: 7, name: "2x4 Softwood", groupId: 9, locationId: 5, qty: 9, reorderLevel: 4, notes: "8 ft boards" },
  { id: 8, name: "Safety Glasses", groupId: 10, locationId: 4, qty: 20, reorderLevel: 5, notes: "" },
];

// Admin + Full-time Lab Workers can manage items and groups.
// Student Workers can browse and use + / - (hasRole comes from js/current-user.js)
const canManage = hasRole(ROLES.admin, ROLES.fullTime);

let nextId = 100;
let editingItemId = null;   // null = the item form is adding, not editing
let editingGroupId = null;
let deleteTarget = null;    // { type: "item" or "group", id }

// ---------- page elements ----------

const pageNotice = document.getElementById("page-message");

const itemTableBody = document.getElementById("item-table-body");
const itemEmpty = document.getElementById("item-empty");
const searchInput = document.getElementById("search-box");
const stockFilter = document.getElementById("filter-stock");
const spaceFilter = document.getElementById("filter-space");
const locationFilter = document.getElementById("filter-location");
const groupFilter = document.getElementById("filter-group");

const itemForm = document.getElementById("item-form");
const itemFormTitle = document.getElementById("item-form-title");
const itemNameField = document.getElementById("item-name");
const itemGroupField = document.getElementById("item-group");
const itemLocationField = document.getElementById("item-location");
const itemQtyField = document.getElementById("item-qty");
const itemReorderField = document.getElementById("item-reorder");
const itemNotesField = document.getElementById("item-notes");

const groupTableBody = document.getElementById("group-table-body");
const groupForm = document.getElementById("group-form");
const groupNameField = document.getElementById("group-name");
const groupParentField = document.getElementById("group-parent");

const deleteModal = document.getElementById("delete-modal");
const deleteMessage = document.getElementById("delete-message");

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

// "Cables / HDMI" or just "Filament"
function groupName(id) {
  const group = groups.find((g) => g.id === id);
  if (group.parentId === null) return group.name;
  return groups.find((g) => g.id === group.parentId).name + " / " + group.name;
}

// "Makerspace - Shelf"
function locationName(id) {
  const loc = locations.find((l) => l.id === id);
  return spaces.find((s) => s.id === loc.spaceId).name + " - " + loc.name;
}

function stockStatus(item) {
  if (item.qty === 0) return "out";
  if (item.reorderLevel !== null && item.qty <= item.reorderLevel) return "low";
  return "ok";
}

const subgroupsOf = (groupId) => groups.filter((g) => g.parentId === groupId);
const itemsInGroup = (groupId) => items.filter((i) => i.groupId === groupId).length;

// ---------- dropdowns ----------

// refill a dropdown from a list of { value, text } and keep what was picked
function fillSelect(select, options, allText) {
  const picked = select.value;
  const allOption = allText ? `<option value="all">${allText}</option>` : "";
  select.innerHTML = allOption + options
    .map((o) => `<option value="${o.value}">${escapeHtml(o.text)}</option>`)
    .join("");
  select.value = picked;
  if (select.value === "") select.selectedIndex = 0;
}

// groups with their subgroups right under them
function groupOptions() {
  const options = [];
  groups.filter((g) => g.parentId === null).forEach((g) => {
    options.push({ value: g.id, text: g.name });
    subgroupsOf(g.id).forEach((s) => options.push({ value: s.id, text: groupName(s.id) }));
  });
  return options;
}

function fillDropdowns() {
  const locationOptions = locations.map((l) => ({ value: l.id, text: locationName(l.id) }));
  const spaceOptions = spaces.map((s) => ({ value: s.id, text: s.name }));
  const parentOptions = groups.filter((g) => g.parentId === null).map((g) => ({ value: g.id, text: g.name }));

  fillSelect(spaceFilter, spaceOptions, "All spaces");
  fillSelect(locationFilter, locationOptions, "All locations");
  fillSelect(groupFilter, groupOptions(), "All groups");
  fillSelect(itemGroupField, groupOptions());
  fillSelect(itemLocationField, locationOptions);
  fillSelect(groupParentField, [{ value: "none", text: "None (new group)" }, ...parentOptions]);
}

// ---------- items ----------

function renderItems() {
  const search = searchInput.value.trim().toLowerCase();
  const stockVal = stockFilter.value;
  const spaceVal = spaceFilter.value;
  const locationVal = locationFilter.value;
  const groupVal = groupFilter.value;

  const filtered = items.filter((i) => {
    const group = groups.find((g) => g.id === i.groupId);
    const loc = locations.find((l) => l.id === i.locationId);
    const matchesSearch = !search || i.name.toLowerCase().includes(search) || String(i.id) === search;
    const matchesStock = stockVal === "all" || stockStatus(i) === stockVal;
    const matchesSpace = spaceVal === "all" || loc.spaceId === Number(spaceVal);
    const matchesLocation = locationVal === "all" || i.locationId === Number(locationVal);
    // picking a group also shows its subgroups' items
    const matchesGroup = groupVal === "all" || i.groupId === Number(groupVal) || group.parentId === Number(groupVal);
    return matchesSearch && matchesStock && matchesSpace && matchesLocation && matchesGroup;
  });

  itemTableBody.innerHTML = "";
  itemEmpty.style.display = filtered.length === 0 ? "block" : "none";

  filtered.forEach((i) => {
    const status = stockStatus(i);
    const qtyText = status === "ok" ? i.qty : `${i.qty} (${status})`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(i.name)}</td>
      <td>${i.id}</td>
      <td>${escapeHtml(groupName(i.groupId))}</td>
      <td>${escapeHtml(locationName(i.locationId))}</td>
      <td>${qtyText}</td>
      <td>${escapeHtml(i.notes)}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="action-btn" data-action="plus" data-id="${i.id}" aria-label="Add one ${escapeHtml(i.name)}">+</button>
          <button type="button" class="action-btn" data-action="minus" data-id="${i.id}" aria-label="Remove one ${escapeHtml(i.name)}">-</button>
          ${canManage ? `
          <button type="button" class="action-btn" data-action="edit" data-id="${i.id}">Edit</button>
          <button type="button" class="action-btn" data-action="move" data-id="${i.id}">Move</button>
          <button type="button" class="action-btn action-btn--danger" data-action="delete" data-id="${i.id}">Delete</button>` : ""}
        </div>
      </td>
    `;
    itemTableBody.appendChild(tr);
  });
}

itemTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === "plus") changeQty(id, 1);
  if (action === "minus") changeQty(id, -1);
  if (action === "edit") openEditItem(id);
  if (action === "move") { openEditItem(id); itemLocationField.focus(); }
  if (action === "delete") openDeleteModal("item", id);
});

function changeQty(id, amount) {
  const item = items.find((i) => i.id === id);
  if (item.qty + amount < 0) return showNotice(`${item.name} is already at 0.`, "error");
  item.qty += amount; // TODO: PUT /api/items/:id with the new quantity
  renderAll();
}

function openEditItem(id) {
  const item = items.find((i) => i.id === id);
  editingItemId = id;
  itemFormTitle.textContent = `Edit ${item.name}`;
  itemNameField.value = item.name;
  itemGroupField.value = item.groupId;
  itemLocationField.value = item.locationId;
  itemQtyField.value = item.qty;
  itemReorderField.value = item.reorderLevel ?? "";
  itemNotesField.value = item.notes;
  itemForm.scrollIntoView();
  itemNameField.focus({ preventScroll: true });
}

function resetItemForm() {
  editingItemId = null;
  itemForm.reset();
  itemFormTitle.textContent = "Add Item";
}

itemForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = itemNameField.value.trim();
  const qty = Number(itemQtyField.value);

  if (!name) return showNotice("Item name is required.", "error");
  if (itemQtyField.value === "" || !Number.isInteger(qty) || qty < 0) {
    return showNotice("Quantity must be a whole number, 0 or more.", "error");
  }

  const data = {
    name,
    groupId: Number(itemGroupField.value),
    locationId: Number(itemLocationField.value),
    qty,
    reorderLevel: itemReorderField.value === "" ? null : Number(itemReorderField.value),
    notes: itemNotesField.value.trim(),
  };

  if (editingItemId) {
    // TODO: PUT /api/items/:id
    Object.assign(items.find((i) => i.id === editingItemId), data);
    showNotice(`${name} updated.`, "success");
  } else {
    // TODO: POST /api/items
    items.push({ id: nextId++, ...data });
    showNotice(`${name} added.`, "success");
  }
  resetItemForm();
  renderAll();
});

document.getElementById("item-cancel-btn").addEventListener("click", resetItemForm);

// ---------- groups ----------

function renderGroups() {
  groupTableBody.innerHTML = "";

  groups.filter((g) => g.parentId === null).forEach((g) => {
    // a group's count includes its subgroups' items
    const subs = subgroupsOf(g.id);
    const total = itemsInGroup(g.id) + subs.reduce((sum, s) => sum + itemsInGroup(s.id), 0);
    addGroupRow(g, escapeHtml(g.name), total);
    subs.forEach((s) => addGroupRow(s, `&nbsp;&nbsp;&nbsp;&ndash; ${escapeHtml(s.name)}`, itemsInGroup(s.id)));
  });
}

// label is already escaped, so it's safe to put in the HTML
function addGroupRow(group, label, count) {
  const isTop = group.parentId === null;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${label}</td>
    <td>${count}</td>
    <td>
      <div class="row-actions">
        ${isTop ? `<button type="button" class="action-btn" data-action="subgroup" data-id="${group.id}">+ Subgroup</button>` : ""}
        <button type="button" class="action-btn" data-action="rename" data-id="${group.id}">Rename</button>
        <button type="button" class="action-btn action-btn--danger" data-action="delete" data-id="${group.id}">Delete</button>
      </div>
    </td>
  `;
  groupTableBody.appendChild(tr);
}

groupTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === "subgroup") openGroupForm(null, id);
  if (action === "rename") openGroupForm(id);
  if (action === "delete") openDeleteModal("group", id);
});

// id = the group being renamed (null = adding), parentId = where a new one goes
function openGroupForm(id, parentId = null) {
  const group = groups.find((g) => g.id === id);
  editingGroupId = group ? id : null;
  groupNameField.value = group ? group.name : "";
  groupParentField.value = group ? (group.parentId ?? "none") : (parentId ?? "none");
  groupParentField.disabled = !!group; // can't move a group when renaming it
  groupForm.style.display = "block";
  groupNameField.focus();
}

function closeGroupForm() {
  editingGroupId = null;
  groupForm.style.display = "none";
}

groupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = groupNameField.value.trim();
  const parentId = groupParentField.value === "none" ? null : Number(groupParentField.value);

  if (!name) return showNotice("Group name is required.", "error");
  const duplicate = groups.some((g) =>
    g.name.toLowerCase() === name.toLowerCase() && g.parentId === parentId && g.id !== editingGroupId);
  if (duplicate) return showNotice(`There's already a group called ${name} there.`, "error");

  if (editingGroupId) {
    // TODO: PUT /api/groups/:id
    groups.find((g) => g.id === editingGroupId).name = name;
    showNotice(`Renamed to ${name}.`, "success");
  } else {
    // TODO: POST /api/groups
    groups.push({ id: nextId++, parentId, name });
    showNotice(`${name} added.`, "success");
  }
  closeGroupForm();
  renderAll();
});

document.getElementById("group-cancel-btn").addEventListener("click", closeGroupForm);
document.getElementById("add-group-btn").addEventListener("click", () => openGroupForm(null));

// ---------- delete popup (items and groups) ----------

function openDeleteModal(type, id) {
  if (type === "group") {
    // don't delete a group that still has items or subgroups
    const group = groups.find((g) => g.id === id);
    if (itemsInGroup(id) > 0) return showNotice(`Can't delete ${group.name}. It still has items. Move them first.`, "error");
    if (subgroupsOf(id).length > 0) return showNotice(`Can't delete ${group.name}. Delete its subgroups first.`, "error");
  }
  const name = type === "item" ? items.find((i) => i.id === id).name : groupName(id);
  deleteTarget = { type, id };
  deleteMessage.textContent = `Are you sure you want to delete ${name}? This cannot be undone.`;
  deleteModal.style.display = "flex";
}

function closeDeleteModal() {
  deleteModal.style.display = "none";
  deleteTarget = null;
}

document.getElementById("delete-confirm-btn").addEventListener("click", () => {
  if (deleteTarget) {
    const { type, id } = deleteTarget;
    if (type === "item") {
      // TODO: DELETE /api/items/:id
      const item = items.find((i) => i.id === id);
      items = items.filter((i) => i.id !== id);
      if (editingItemId === id) resetItemForm();
      showNotice(`${item.name} deleted.`, "success");
    } else {
      // TODO: DELETE /api/groups/:id
      const name = groupName(id);
      groups = groups.filter((g) => g.id !== id);
      closeGroupForm();
      showNotice(`${name} deleted.`, "success");
    }
    renderAll();
  }
  closeDeleteModal();
});

document.getElementById("delete-cancel-btn").addEventListener("click", closeDeleteModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDeleteModal(); });

// ---------- start ----------

function renderAll() {
  fillDropdowns();
  renderItems();
  renderGroups();
}

[searchInput, stockFilter, spaceFilter, locationFilter, groupFilter].forEach((el) => {
  el.addEventListener("input", renderItems);
});

renderAll();