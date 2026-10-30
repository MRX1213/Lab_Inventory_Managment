
// same sample items as the inventory page (will come from /api/items later)
var items = [
    { id: 1, name: "PLA Black" },
    { id: 2, name: "ABS Red" },
    { id: 3, name: "Nozzle 0.4mm" },
    { id: 4, name: "AA Batteries" },
    { id: 5, name: "HDMI Cable 6ft" },
    { id: 6, name: "Plywood Sheet" },
    { id: 7, name: "2x4 Softwood" },
    { id: 8, name: "Safety Glasses" }
];

// test accounts, used to show names and roles (will come from the backend later)
var users = [
    { email: "student@lab.edu", name: "Test Student", role: "Student Worker" },
    { email: "fulltime@lab.edu", name: "Test Worker", role: "Full-time Lab Worker" },
    { email: "admin@lab.edu", name: "Test Admin", role: "Admin" },
    { email: "jmiller@lab.edu", name: "Jordan Miller", role: "Student Worker" }
];

// itemId null = they asked for something new (newItemName)
var requests = [
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
      decidedBy: "", decisionNotes: "", decidedAt: "" }
];

var nextId = 100;            // id for the next request (the database will do this later)
var decidingId = null;       // which request is being approved/rejected
var decidingStatus = "";     // "Approved" or "Rejected"

// the login page should save these once it's connected.
// until then, the "Testing only" dropdown sets them
var currentEmail = sessionStorage.getItem("email") || "student@lab.edu";
var currentRole = findUser(currentEmail).role;
var canReview = currentRole === "Admin" || currentRole === "Full-time Lab Worker";

// TEMPORARY test dropdown (delete this part once login works)
var testAs = document.getElementById("test-as");
testAs.value = currentEmail;
testAs.addEventListener("change", function () {
    sessionStorage.setItem("email", testAs.value);
    sessionStorage.setItem("role", findUser(testAs.value).role);
    window.location.reload();
});

function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
    }
    return null;
}

function findUser(email) {
    for (var i = 0; i < users.length; i++) {
        if (users[i].email === email) return users[i];
    }
    return { email: email, name: email, role: "Student Worker" };
}

function itemName(request) {
    if (request.itemId === null) return request.newItemName;
    var item = findById(items, request.itemId);
    return item ? item.name : "(deleted item)";
}

// "Oct 14, 11:15 AM"
function formatDate(text) {
    return new Date(text).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// right now, in the same format as the sample data
function now() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

function makeCell(text, smallText) {
    var cell = document.createElement("td");
    cell.textContent = text;
    // optional second line in small gray text
    if (smallText) {
        var small = document.createElement("span");
        small.className = "small-text";
        small.textContent = smallText;
        cell.appendChild(small);
    }
    return cell;
}

function makeButton(text, onClick, danger) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = danger ? "action-btn action-btn--danger" : "action-btn";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

var messageBox = document.getElementById("page-message");
function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = "notice notice--" + type;
    messageBox.hidden = false;
}

// open / close a popup (Escape closes it too)
function openModal(id) {
    document.getElementById(id).hidden = false;
}

function closeModal(id) {
    document.getElementById(id).hidden = true;
}

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeModal("request-modal");
        closeModal("decision-modal");
    }
});

// student workers only see their own requests
function visibleRequests() {
    return requests.filter(function (r) {
        return canReview || r.requestedBy === currentEmail;
    });
}

function showSummary() {
    var counts = { Pending: 0, Approved: 0, Rejected: 0 };
    visibleRequests().forEach(function (r) { counts[r.status]++; });
    document.getElementById("pending-count").textContent = counts.Pending;
    document.getElementById("approved-count").textContent = counts.Approved;
    document.getElementById("rejected-count").textContent = counts.Rejected;
}

function matchesFilters(request) {
    var status = document.getElementById("filter-status").value;
    var search = document.getElementById("search-box").value.trim().toLowerCase();
    if (status !== "all" && request.status !== status) return false;
    if (search !== "" &&
        !itemName(request).toLowerCase().includes(search) &&
        !findUser(request.requestedBy).name.toLowerCase().includes(search)) return false;
    return true;
}

function showRequests() {
    showSummary();
    var tableBody = document.getElementById("request-table-body");
    tableBody.innerHTML = "";

    // newest first
    var list = visibleRequests().filter(matchesFilters).sort(function (a, b) {
        return b.createdAt.localeCompare(a.createdAt);
    });

    list.forEach(function (r) {
        var row = document.createElement("tr");
        row.appendChild(makeCell(r.id));
        row.appendChild(makeCell(itemName(r), r.itemId === null ? "New item" : ""));
        row.appendChild(makeCell(r.qty));
        row.appendChild(makeCell(findUser(r.requestedBy).name, formatDate(r.createdAt)));

        var reason = makeCell(r.reason === "" ? "-" : r.reason);
        reason.className = "reason";
        row.appendChild(reason);

        var statusCell = document.createElement("td");
        var badge = document.createElement("span");
        badge.className = "status-badge " + r.status.toLowerCase();
        badge.textContent = r.status;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        if (r.status === "Pending") {
            row.appendChild(makeCell("Waiting for review"));
        } else {
            row.appendChild(makeCell(r.decisionNotes || "No notes",
                findUser(r.decidedBy).name + ", " + formatDate(r.decidedAt)));
        }

        // approve / reject buttons (reviewers only)
        if (canReview) {
            var cell = document.createElement("td");
            if (r.status === "Pending") {
                var actions = document.createElement("div");
                actions.className = "row-actions";
                actions.appendChild(makeButton("Approve", function () { openDecision(r, "Approved"); }));
                actions.appendChild(makeButton("Reject", function () { openDecision(r, "Rejected"); }, true));
                cell.appendChild(actions);
            }
            row.appendChild(cell);
        }

        tableBody.appendChild(row);
    });

    if (list.length === 0) {
        var row = document.createElement("tr");
        var cell = makeCell(visibleRequests().length === 0
            ? "No requests yet. Click + New request when the lab needs something."
            : "No requests match these filters.");
        cell.colSpan = canReview ? 8 : 7;
        cell.className = "empty-state";
        row.appendChild(cell);
        tableBody.appendChild(row);
    }

    document.getElementById("table-title").textContent = canReview ? "All requests" : "My requests";
}

var requestForm = document.getElementById("request-form");
var requestError = document.getElementById("request-error");

function requestType() {
    return document.querySelector("input[name='request-type']:checked").value;
}

// show the item dropdown OR the new item box, depending on the radio picked
function updateRequestType() {
    var isNew = requestType() === "new";
    document.getElementById("existing-item-field").hidden = isNew;
    document.getElementById("new-item-field").hidden = !isNew;
}

document.querySelectorAll("input[name='request-type']").forEach(function (radio) {
    radio.addEventListener("change", updateRequestType);
});

document.getElementById("new-request-btn").addEventListener("click", function () {
    requestForm.reset();
    requestError.hidden = true;

    // fill the item dropdown, sorted A-Z
    var select = document.getElementById("request-item");
    select.innerHTML = "";
    items.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });

    updateRequestType();
    openModal("request-modal");
    select.focus();
});

document.getElementById("request-cancel-btn").addEventListener("click", function () {
    closeModal("request-modal");
});

requestForm.addEventListener("submit", function (event) {
    event.preventDefault(); // stop the page from refreshing
    var isNew = requestType() === "new";
    var newName = document.getElementById("request-new-name").value.trim();
    var qty = Number(document.getElementById("request-qty").value);

    // check the form before saving
    var error = "";
    if (isNew && newName === "") error = "Type the name of the item you need.";
    else if (!Number.isInteger(qty) || qty < 1) error = "Quantity has to be a whole number, 1 or more.";
    if (error !== "") {
        requestError.textContent = error;
        requestError.hidden = false;
        return;
    }

    // TODO: send to backend
    requests.push({
        id: nextId++,
        itemId: isNew ? null : Number(document.getElementById("request-item").value),
        newItemName: isNew ? newName : "",
        qty: qty,
        reason: document.getElementById("request-reason").value.trim(),
        requestedBy: currentEmail,
        createdAt: now(),
        status: "Pending",
        decidedBy: "",
        decisionNotes: "",
        decidedAt: ""
    });

    closeModal("request-modal");
    showMessage("Request submitted. It shows as Pending until someone reviews it.", "success");
    showRequests();
});

function openDecision(request, status) {
    decidingId = request.id;
    decidingStatus = status;
    var verb = status === "Approved" ? "Approve" : "Reject";

    document.getElementById("decision-title").textContent =
        verb + " request #" + request.id + ": " + request.qty + " x " + itemName(request) + "?";
    var saveButton = document.getElementById("decision-save-btn");
    saveButton.textContent = verb;
    saveButton.className = status === "Approved" ? "btn-primary" : "btn-danger";
    document.getElementById("decision-notes").value = "";

    openModal("decision-modal");
    document.getElementById("decision-notes").focus();
}

document.getElementById("decision-cancel-btn").addEventListener("click", function () {
    closeModal("decision-modal");
});

document.getElementById("decision-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var request = findById(requests, decidingId);

    // TODO: send to backend
    request.status = decidingStatus;
    request.decidedBy = currentEmail;
    request.decisionNotes = document.getElementById("decision-notes").value.trim();
    request.decidedAt = now();

    closeModal("decision-modal");
    showMessage(decidingStatus + " request #" + request.id + ".", "success");
    showRequests();
});

// students don't get the Actions column
if (!canReview) {
    document.querySelector("th.reviewer-only").remove();
}

// reviewers start on what still needs a decision
if (canReview) {
    document.getElementById("filter-status").value = "Pending";
}

document.getElementById("search-box").addEventListener("input", showRequests);
document.getElementById("filter-status").addEventListener("change", showRequests);

showRequests();
