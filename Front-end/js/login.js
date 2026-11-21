var ACCOUNTS = [
  { email: "deep.patel@example.edu", password: "password123", firstName: "Deep", lastName: "Patel", role: "Admin" },
  { email: "beau.smith@example.edu", password: "password123", firstName: "Beau", lastName: "Smith", role: "Full-time Lab Worker" },
  { email: "sam.rivera@example.edu", password: "password123", firstName: "Sam", lastName: "Rivera", role: "Student Worker" },
];

var loginForm = document.getElementById("login-form");
var errorMessage = document.getElementById("error-message");

if (sessionStorage.getItem("currentUser")) {
  window.location.href = "dashboard.html";
}

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();

  var email = document.getElementById("email").value;
  var password = document.getElementById("password").value;
  errorMessage.textContent = "";

  if (email === "" || password === "") {
    errorMessage.textContent = "Email and password are required.";
    return;
  }

  var account = ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
  );

  if (!account) {
    errorMessage.textContent = "Incorrect email or password.";
    return;
  }

  var safeUser = { firstName: account.firstName, lastName: account.lastName, email: account.email, role: account.role };
  sessionStorage.setItem("currentUser", JSON.stringify(safeUser));
  window.location.href = "dashboard.html";
});

var forgotLink = document.getElementById("forgot-password-link");
forgotLink.addEventListener("click", function (event) {
  event.preventDefault();
  errorMessage.textContent = "Password reset isn't available yet - contact an Admin.";
});