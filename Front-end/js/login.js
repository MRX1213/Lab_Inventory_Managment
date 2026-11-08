// get the form from the page
var loginForm = document.getElementById("login-form");
var errorMessage = document.getElementById("error-message");

// if already logged in, skip straight to the dashboard
if (getCurrentUser()) {
  window.location.href = "dashboard.html";
}

// run this when the form is submitted
loginForm.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the page from refreshing

  var email = document.getElementById("email").value;
  var password = document.getElementById("password").value;

  errorMessage.textContent = "";

  // simple check to make sure both fields are filled in
  if (email === "" || password === "") {
    errorMessage.textContent = "Email and password are required.";
    return;
  }

  // checkLogin() comes from auth.js — checks against the mock ACCOUNTS list
  // until the real login API exists
  var account = checkLogin(email, password);

  if (account === null) {
    errorMessage.textContent = "Incorrect email or password.";
    return;
  }

  // setCurrentUser() comes from auth.js — saves who's logged in (minus the password)
  setCurrentUser(account);
  window.location.href = "dashboard.html";
});

// run this when "forgot password" is clicked
var forgotLink = document.getElementById("forgot-password-link");
forgotLink.addEventListener("click", function (event) {
  event.preventDefault();
  // TODO: wire to the real password-reset flow once the backend exists
  errorMessage.textContent = "Password reset isn't available yet - contact an Admin.";
});