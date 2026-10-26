// inventory page: items, groups/subgroups, and locations
// sample data until the backend is connected (changes reset on refresh)

// ============================================================
// 1. DATA
// ============================================================

var spaces = [
    { id: 1, name: "Makerspace" },
    { id: 2, name: "Project Room" }
];

var locations = [
    { id: 1, spaceId: 1, name: "3D Printer Area" },
    { id: 2, spaceId: 1, name: "Laser Cutter Area" },
    { id: 3, spaceId: 1, name: "Shelf" },
    { id: 4, spaceId: 2, name: "Shelf" },
    { id: 5, spaceId: 2, name: "Wood Cutting Station" }
];

// parentId null = group, otherwise it's a subgroup of that group
var groups = [
    { id: 1, parentId: null, name: "Filament" },
    { id: 2, parentId: null, name: "Printer Parts" },
    { id: 3, parentId: null, name: "Batteries" },
    { id: 4, parentId: null, name: "Cables" },
    { id: 5, parentId: 4, name: "HDMI" },
    { id: 6, parentId: 4, name: "USB" },
    { id: 7, parentId: null, name: "Wood" },
    { id: 8, parentId: 7, name: "Plywood" },
    { id: 9, parentId: 7, name: "Softwood" },
    { id: 10, parentId: null, name: "Safety Gear" }
];

// reorderLevel = at or below this counts as low stock (null = not set)
var items = [
    { id: 1, name: "PLA Black", groupId: 1, locationId: 1, qty: 12, reorderLevel: 4, notes: "1.75mm spools" },
    { id: 2, name: "ABS Red", groupId: 1, locationId: 1, qty: 2, reorderLevel: 3, notes: "" },
    { id: 3, name: "Nozzle 0.4mm", groupId: 2, locationId: 1, qty: 0, reorderLevel: 2, notes: "" },
    { id: 4, name: "AA Batteries", groupId: 3, locationId: 3, qty: 3, reorderLevel: 10, notes: "" },
    { id: 5, name: "HDMI Cable 6ft", groupId: 5, locationId: 3, qty: 5, reorderLevel: 2, notes: "" },
    { id: 6, name: "Plywood Sheet", groupId: 8, locationId: 2, qty: 15, reorderLevel: 5, notes: "1/8 in" },
    { id: 7, name: "2x4 Softwood", groupId: 9, locationId: 5, qty: 9, reorderLevel: 4, notes: "8 ft boards" },
    { id: 8, name: "Safety Glasses", groupId: 10, locationId: 4, qty: 20, reorderLevel: 5, notes: "" }
];

var nextId = 100;            // id for the next new thing (the database will do this later)
var editingItemId = null;    // null = the form is adding, not editing
var editingGroupId = null;


// ============================================================
// 2. HELPERS
// ============================================================

function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
    }
    return null;
}

// "Cables / HDMI" or just "Filament"
function groupName(id) {
    var group = findById(groups, id);
    if (group.parentId === null) return group.name;
    return findById(groups, group.parentId).name + " / " + group.name;
}

// "Makerspace - Shelf"
function locationName(id) {
    var loc = findById(locations, id);
    return findById(spaces, loc.spaceId).name + " - " + loc.name;
}

function stockStatus(item) {
    if (item.qty === 0) return "out";
    if (item.reorderLevel !== null && item.qty <= item.reorderLevel) return "low";
    return "ok";
}

// how many items have this group or location
function countItems(field, id) {
    var count = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i][field] === id) count++;
    }
    return count;
}

function getSubgroups(groupId) {
    return groups.filter(function (g) { return g.parentId === groupId; });
}

function makeCell(text) {
    var cell = document.createElement("td");
    cell.textContent = text;
    return cell;
}

function makeButton(text, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

function addOption(select, value, text) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

// green or red message under the page title
var messageBox = document.createElement("p");
messageBox.hidden = true;
document.querySelector("main h1").after(messageBox);

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.hidden = false;
}

function val(id) {
    return document.getElementById(id).value.trim();
}


// ============================================================
// 3. DROPDOWNS
// ============================================================

// refill a dropdown but keep what was picked (or go back to the first choice)
function refill(id, allText, fillFunction) {
    var select = document.getElementById(id);
    var picked = select.value;
    select.innerHTML = "";
    if (allText) addOption(select, "all", allText);
    fillFunction(select);
    select.value = picked;
    if (select.value === "") select.selectedIndex = 0;
}

function addGroupOptions(select) {
    groups.forEach(function (g) {
        if (g.parentId !== null) return;
        addOption(select, g.id, g.name);
        getSubgroups(g.id).forEach(function (sub) {
            addOption(select, sub.id, groupName(sub.id));
        });
    });
}

function addLocationOptions(select) {
    locations.forEach(function (l) { addOption(select, l.id, locationName(l.id)); });
}

function addSpaceOptions(select) {
    spaces.forEach(function (s) { addOption(select, s.id, s.name); });
}

function fillDropdowns() {
    refill("filter-space", "All spaces", addSpaceOptions);
    refill("filter-location", "All locations", addLocationOptions);
    refill("filter-group", "All groups", addGroupOptions);
    refill("item-group", null, addGroupOptions);
    refill("item-location", null, addLocationOptions);
    refill("group-parent", null, function (select) {
        addOption(select, "none", "None (new group)");
        groups.forEach(function (g) {
            if (g.parentId === null) addOption(select, g.id, g.name);
        });
    });
}


// ============================================================
// 4. ITEM TABLE + FILTERS
// ============================================================

function matchesFilters(item) {
    var search = val("search-box").toLowerCase();
    var stock = val("filter-stock");
    var space = val("filter-space");
    var location = val("filter-location");
    var group = val("filter-group");

    if (search !== "" && !item.name.toLowerCase().includes(search) && String(item.id) !== search) return false;
    if (stock !== "all" && stockStatus(item) !== stock) return false;
    if (space !== "all" && findById(locations, item.locationId).spaceId !== Number(space)) return false;
    if (location !== "all" && item.locationId !== Number(location)) return false;
    // picking a group also shows its subgroups' items
    if (group !== "all" && item.groupId !== Number(group) &&
        findById(groups, item.groupId).parentId !== Number(group)) return false;
    return true;
}

function showItems() {
    var tableBody = document.getElementById("item-table-body");
    tableBody.innerHTML = "";

    items.filter(matchesFilters).forEach(function (item) {
        var row = document.createElement("tr");
        var status = stockStatus(item);
        var qtyText = item.qty + (status === "ok" ? "" : " (" + status + ")");

        row.appendChild(makeCell(item.name));
        row.appendChild(makeCell(item.id));
        row.appendChild(makeCell(groupName(item.groupId)));
        row.appendChild(makeCell(locationName(item.locationId)));
        row.appendChild(makeCell(qtyText));
        row.appendChild(makeCell(item.notes));

        var actions = document.createElement("td");
        actions.appendChild(makeButton("+", function () { changeQty(item, 1); }));
        actions.appendChild(makeButton("-", function () { changeQty(item, -1); }));
        actions.appendChild(makeButton("Edit", function () { editItem(item); }));
        actions.appendChild(makeButton("Move", function () {
            editItem(item);
            document.getElementById("item-location").focus();
        }));
        actions.appendChild(makeButton("Delete", function () { deleteItem(item); }));
        row.appendChild(actions);

        tableBody.appendChild(row);
    });

    if (tableBody.children.length === 0) {
        var row = document.createElement("tr");
        var cell = makeCell("No items match these filters.");
        cell.colSpan = 7;
        row.appendChild(cell);
        tableBody.appendChild(row);
    }
}


// ============================================================
// 5. ITEM ACTIONS
// ============================================================

var itemForm = document.getElementById("item-form");

function changeQty(item, amount) {
    if (item.qty + amount < 0) return showMessage(item.name + " is already at 0.", "error");
    item.qty += amount; // TODO: send to backend
    refreshPage();
}

function editItem(item) {
    editingItemId = item.id;
    itemForm.querySelector("h2").textContent = "Edit " + item.name;
    document.getElementById("item-name").value = item.name;
    document.getElementById("item-group").value = item.groupId;
    document.getElementById("item-location").value = item.locationId;
    document.getElementById("item-qty").value = item.qty;
    document.getElementById("item-reorder").value = item.reorderLevel === null ? "" : item.reorderLevel;
    document.getElementById("item-notes").value = item.notes;
    itemForm.scrollIntoView();
}

function resetItemForm() {
    editingItemId = null;
    itemForm.reset();
    itemForm.querySelector("h2").textContent = "Add Item";
}

itemForm.addEventListener("submit", function (event) {
    event.preventDefault(); // stop the page from refreshing
    var qty = Number(val("item-qty"));
    var reorder = val("item-reorder");

    if (val("item-name") === "") return showMessage("Item name is required.", "error");
    if (val("item-qty") === "" || !Number.isInteger(qty) || qty < 0) return showMessage("Quantity must be a whole number, 0 or more.", "error");

    var data = {
        name: val("item-name"),
        groupId: Number(val("item-group")),
        locationId: Number(val("item-location")),
        qty: qty,
        reorderLevel: reorder === "" ? null : Number(reorder),
        notes: val("item-notes")
    };

    // TODO: send to backend
    if (editingItemId === null) {
        data.id = nextId++;
        items.push(data);
        showMessage("Added " + data.name + ".", "success");
    } else {
        Object.assign(findById(items, editingItemId), data); // copy the new values onto the item
        showMessage("Saved " + data.name + ".", "success");
    }
    resetItemForm();
    refreshPage();
});

itemForm.querySelector("button[type='button']").addEventListener("click", resetItemForm);

function deleteItem(item) {
    if (!confirm("Delete " + item.name + "?")) return;
    items.splice(items.indexOf(item), 1); // TODO: send to backend
    resetItemForm();
    showMessage("Deleted " + item.name + ".", "success");
    refreshPage();
}


// ============================================================
// 6. GROUPS + SUBGROUPS
// ============================================================

var groupForm = document.getElementById("group-form");

function showGroups() {
    var tableBody = document.getElementById("group-table-body");
    tableBody.innerHTML = "";

    groups.forEach(function (g) {
        if (g.parentId !== null) return;
        var subs = getSubgroups(g.id);
        // a group's count includes its subgroups' items
        var total = countItems("groupId", g.id);
        subs.forEach(function (s) { total += countItems("groupId", s.id); });

        addGroupRow(tableBody, g, g.name, total);
        subs.forEach(function (s) {
            addGroupRow(tableBody, s, "\u00A0\u00A0\u00A0\u2013 " + s.name, countItems("groupId", s.id));
        });
    });
}

function addGroupRow(tableBody, group, label, count) {
    var row = document.createElement("tr");
    row.appendChild(makeCell(label));
    row.appendChild(makeCell(count));
    var actions = document.createElement("td");
    if (group.parentId === null) {
        actions.appendChild(makeButton("+ Subgroup", function () { openGroupForm(null, group.id); }));
    }
    actions.appendChild(makeButton("Rename", function () { openGroupForm(group, group.parentId); }));
    actions.appendChild(makeButton("Delete", function () { deleteGroup(group); }));
    row.appendChild(actions);
    tableBody.appendChild(row);
}

// group = the one being renamed (null = adding), parentId = where it goes
function openGroupForm(group, parentId) {
    editingGroupId = group ? group.id : null;
    document.getElementById("group-name").value = group ? group.name : "";
    document.getElementById("group-parent").value = parentId === null ? "none" : parentId;
    document.getElementById("group-parent").disabled = group !== null; // can't change parent when renaming
    groupForm.hidden = false;
    document.getElementById("group-name").focus();
}

groupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = val("group-name");
    var parentId = val("group-parent") === "none" ? null : Number(val("group-parent"));

    if (name === "") return showMessage("Group name is required.", "error");
    var duplicate = groups.some(function (g) {
        return g.name.toLowerCase() === name.toLowerCase() && g.parentId === parentId && g.id !== editingGroupId;
    });
    if (duplicate) return showMessage("There's already a group called " + name + " there.", "error");

    // TODO: send to backend
    if (editingGroupId === null) {
        groups.push({ id: nextId++, parentId: parentId, name: name });
        showMessage("Added " + name + ".", "success");
    } else {
        findById(groups, editingGroupId).name = name;
        showMessage("Renamed to " + name + ".", "success");
    }
    groupForm.hidden = true;
    refreshPage();
});

groupForm.querySelector("button[type='button']").addEventListener("click", function () { groupForm.hidden = true; });
document.getElementById("add-group-btn").addEventListener("click", function () { openGroupForm(null, null); });

function deleteGroup(group) {
    // don't delete a group that still has items or subgroups
    if (countItems("groupId", group.id) > 0) return showMessage("Can't delete " + group.name + ". It still has items. Move them first.", "error");
    if (getSubgroups(group.id).length > 0) return showMessage("Can't delete " + group.name + ". Delete its subgroups first.", "error");
    if (!confirm("Delete " + groupName(group.id) + "?")) return;
    groups.splice(groups.indexOf(group), 1); // TODO: send to backend
    groupForm.hidden = true;
    showMessage("Deleted " + group.name + ".", "success");
    refreshPage();
}

// ============================================================
// 7. START
// ============================================================

// redraw everything after any change
function refreshPage() {
    fillDropdowns();
    showItems();
    showGroups();
}

["search-box", "filter-stock", "filter-space", "filter-location", "filter-group"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", showItems);
});

groupForm.hidden = true;
refreshPage();