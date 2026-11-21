// placeholder numbers until the backend is connected
// these just prove the page structure works for now

document.getElementById("total-items").textContent = "0";
document.getElementById("low-stock").textContent = "0";
document.getElementById("out-of-stock").textContent = "0";
document.getElementById("pending-count").textContent = "0";
document.getElementById("approved-count").textContent = "0";
document.getElementById("rejected-count").textContent = "0";

// TODO: once backend API exists, replace the lines above with a real
// fetch() call that gets these numbers from the database