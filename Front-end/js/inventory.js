// Inventory — loaded from SQL Server via /api.

let spaces = [];
let locations = [];
let groups = [];
let locationGroups = [];
let items = [];

async function loadInventoryFromApi() {
  const [sp, ar, cat, ac, it] = await Promise.all([
    window.labApi.apiFetch("/spaces"),
    window.labApi.apiFetch("/areas"),
    window.labApi.apiFetch("/categories"),
    window.labApi.apiFetch("/area-categories"),
    window.labApi.apiFetch("/items?stock=all"),
  ]);
  spaces = sp.data.spaces.map((s) => ({ id: s.spaceId, name: s.spaceName }));
  locations = ar.data.areas.map((a) => ({
    id: a.areaId,
    spaceId: a.spaceId,
    name: a.areaName,
    displayLabel: a.displayLabel,
  }));
  groups = cat.data.categories.map((c) => ({
    id: c.categoryId,
    parentId: c.parentCategoryId,
    name: c.categoryName,
  }));
  locationGroups = ac.data.mappings.map((m) => ({ locationId: m.areaId, groupId: m.categoryId }));
  items = it.data.items.map((i) => ({
    id: i.itemId,
    name: i.itemName,
    groupId: i.categoryId,
    locationId: i.areaId,
    qty: i.quantityOnHand,
    reorderLevel: i.reorderLevel,
    notes: i.notes || "",
    rowVersion: i.rowVersion,
  }));
}

// Admin + Full-time Lab Workers can manage items and groups.
// Student Workers can browse and use + / - (hasRole comes from js/current-user.js)
let canManage = false;

let nextId = 100;
let editingItemId = null;   // null = the item form is adding, not editing
let editingGroupId = null;
let deleteTarget = null;    // { type: "item" or "group", id }

// ---------- page elements ----------


const itemTableBody = document.getElementById("item-table-body");
const itemEmpty = document.getElementById("item-empty");
const searchInput = document.getElementById("search-box");
const stockFilter = document.getElementById("filter-stock");
const spaceFilter = document.getElementById("filter-space");
const locationFilter = document.getElementById("filter-location");
const groupFilter = document.getElementById("filter-group");
const filterNotice = document.getElementById("filter-notice");

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

// escapeHtml() and showNotice() come from js/notices.js

// "Cables / HDMI" or just "Filament"
function groupName(id) {
  const group = groups.find((g) => g.id === id);
  if (group.parentId === null) return group.name;
  return groups.find((g) => g.id === group.parentId).name + " / " + group.name;
}

// "Makerspace - Shelf"
function locationName(id) {
  const loc = locations.find((l) => l.id === id);
  if (!loc) return "";
  if (loc.displayLabel) return loc.displayLabel;
  return spaces.find((s) => s.id === loc.spaceId).name + " - " + loc.name;
}

function stockStatus(item) {
  if (item.qty === 0) return "out";
  if (item.reorderLevel !== null && item.qty <= item.reorderLevel) return "low";
  return "ok";
}

const subgroupsOf = (groupId) => groups.filter((g) => g.parentId === groupId);

// locations where this group (or its parent group) is allowed
function locationsForGroup(groupId) {
  const group = groups.find((g) => g.id === groupId);
  const ids = [group.id, group.parentId];
  return locationGroups.filter((m) => ids.includes(m.groupId)).map((m) => m.locationId);
}
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
  fillSelect(groupFilter, groupOptions(), "All groups");
  fillSelect(locationFilter, filterLocationOptions(), "All locations");
  fillSelect(itemGroupField, groupOptions());
  fillSelect(itemLocationField, locationOptions);
  fillSelect(groupParentField, [{ value: "none", text: "None (new group)" }, ...parentOptions]);
}

// ---------- linked filters ----------
// the filters have to make sense together: a location has to be in the picked space,
// and the picked group has to be allowed in that location. If a change makes another
// filter impossible, that filter resets to "All" and a short note says why.

// location filter choices: only locations in the picked space where the picked group is allowed
function filterLocationOptions() {
  const spaceVal = spaceFilter.value || "all";
  const groupVal = groupFilter.value || "all";
  const allowed = groupVal === "all" ? null : locationsForGroup(Number(groupVal));
  return locations
    .filter((l) => spaceVal === "all" || l.spaceId === Number(spaceVal))
    .filter((l) => !allowed || allowed.includes(l.id))
    .map((l) => ({ value: l.id, text: locationName(l.id) }));
}

function showFilterNotice(message) {
  filterNotice.textContent = message;
  filterNotice.style.display = message ? "block" : "none";
}

// changed = which filter the person just changed ("space", "location", or "group")
function onFilterChange(changed) {
  const notes = [];
  const groupVal = groupFilter.value;
  const groupLocations = groupVal === "all" ? null : locationsForGroup(Number(groupVal));

  if (groupLocations && groupLocations.length === 0) {
    notes.push(`No locations are mapped to ${groupName(Number(groupVal))}.`);
  }

  // space changed: the group has to be allowed somewhere in the new space
  if (changed === "space" && groupLocations && spaceFilter.value !== "all") {
    const inSpace = locations.some((l) => l.spaceId === Number(spaceFilter.value) && groupLocations.includes(l.id));
    if (!inSpace) {
      notes.push(`Group reset: ${groupName(Number(groupVal))} isn't kept in this space.`);
      groupFilter.value = "all";
    }
  }

  // location changed: the group has to be allowed in the new location
  if (changed === "location" && groupLocations && locationFilter.value !== "all" &&
      !groupLocations.includes(Number(locationFilter.value))) {
    notes.push(`Group reset: ${groupName(Number(groupVal))} isn't kept in this location.`);
    groupFilter.value = "all";
  }

  // group changed: the space has to have somewhere the group is allowed
  if (changed === "group" && groupLocations && groupLocations.length > 0 && spaceFilter.value !== "all") {
    const inSpace = locations.some((l) => l.spaceId === Number(spaceFilter.value) && groupLocations.includes(l.id));
    if (!inSpace) {
      notes.push("Space reset: this group isn't kept there.");
      spaceFilter.value = "all";
    }
  }

  // refill the location choices, and note it if the picked location no longer fits
  const pickedLocation = locationFilter.value;
  fillSelect(locationFilter, filterLocationOptions(), "All locations");
  if (pickedLocation !== "all" && locationFilter.value !== pickedLocation) {
    notes.push("Location reset: it doesn't fit the other filters.");
  }

  showFilterNotice(notes.join(" "));
  renderItems();
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
    // low / out of stock: words AND red, not color alone (accessibility)
    const status = stockStatus(i);
    const warning = { low: "Low stock", out: "Out of stock" }[status];
    const qtyText = warning ? `${i.qty}<span class="stock-warning">${warning}</span>` : i.qty;
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

async function changeQty(id, amount) {
  const item = items.find((i) => i.id === id);
  if (item.qty + amount < 0) return showNotice(`${item.name} is already at 0.`, "error");
  try {
    await window.labApi.apiFetch(`/items/${id}/quantity`, {
      method: "POST",
      body: { delta: amount },
    });
    await loadInventoryFromApi();
    renderAll();
  } catch (e) {
    showNotice(e.message || "Quantity update failed.", "error");
  }
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

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = itemNameField.value.trim();
  const qty = Number(itemQtyField.value);

  if (!name) return showNotice("Item name is required.", "error");
  if (itemQtyField.value === "" || !Number.isInteger(qty) || qty < 0) {
    return showNotice("Quantity must be a whole number, 0 or more.", "error");
  }

  const baseBody = {
    itemName: name,
    categoryId: Number(itemGroupField.value),
    areaId: Number(itemLocationField.value),
    reorderLevel: itemReorderField.value === "" ? null : Number(itemReorderField.value),
    notes: itemNotesField.value.trim(),
  };

  try {
    if (editingItemId) {
      const existing = items.find((i) => i.id === editingItemId);
      await window.labApi.apiFetch(`/items/${editingItemId}`, {
        method: "PUT",
        body: { ...baseBody, rowVersion: existing?.rowVersion },
      });
      showNotice(`${name} updated.`, "success");
    } else {
      await window.labApi.apiFetch("/items", {
        method: "POST",
        body: { ...baseBody, quantityOnHand: qty },
      });
      showNotice(`${name} added.`, "success");
    }
    await loadInventoryFromApi();
    resetItemForm();
    renderAll();
  } catch (err) {
    showNotice(err.message || "Save failed.", "error");
  }
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

groupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = groupNameField.value.trim();
  const parentId = groupParentField.value === "none" ? null : Number(groupParentField.value);

  if (!name) return showNotice("Group name is required.", "error");

  try {
    if (editingGroupId) {
      await window.labApi.apiFetch(`/categories/${editingGroupId}`, {
        method: "PUT",
        body: { categoryName: name },
      });
      showNotice(`Renamed to ${name}.`, "success");
    } else {
      await window.labApi.apiFetch("/categories", {
        method: "POST",
        body: { categoryName: name, parentCategoryId: parentId },
      });
      showNotice(`${name} added.`, "success");
    }
    await loadInventoryFromApi();
    closeGroupForm();
    renderAll();
  } catch (err) {
    showNotice(err.message || "Group save failed.", "error");
  }
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

document.getElementById("delete-confirm-btn").addEventListener("click", async () => {
  if (deleteTarget) {
    const { type, id } = deleteTarget;
    try {
      if (type === "item") {
        const item = items.find((i) => i.id === id);
        await window.labApi.apiFetch(`/items/${id}`, {
          method: "DELETE",
          body: { rowVersion: item?.rowVersion },
        });
        if (editingItemId === id) resetItemForm();
        showNotice(`${item.name} deleted.`, "success");
      } else {
        const name = groupName(id);
        await window.labApi.apiFetch(`/categories/${id}`, { method: "DELETE", body: {} });
        closeGroupForm();
        showNotice(`${name} deleted.`, "success");
      }
      await loadInventoryFromApi();
      renderAll();
    } catch (err) {
      showNotice(err.message || "Delete failed.", "error");
    }
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

searchInput.addEventListener("input", renderItems);
stockFilter.addEventListener("change", renderItems);
spaceFilter.addEventListener("change", () => onFilterChange("space"));
locationFilter.addEventListener("change", () => onFilterChange("location"));
groupFilter.addEventListener("change", () => onFilterChange("group"));

(async function initInventoryPage() {
  await window.labAuthReady;
  canManage = hasRole(ROLES.admin, ROLES.fullTime);
  try {
    await loadInventoryFromApi();
    renderAll();
  } catch (e) {
    showNotice("Could not load inventory: " + e.message, "error");
  }
})();
