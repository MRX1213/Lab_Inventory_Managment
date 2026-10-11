// get the form from the page
var loginForm = document.getElementById("login-form");

// run this when the form is submitted
loginForm.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the page from refreshing

  var email = document.getElementById("email").value;
  var password = document.getElementById("password").value;
  var errorMessage = document.getElementById("error-message");

  errorMessage.textContent = "";

  // simple check to make sure both fields are filled in
  if (email === "" || password === "") {
    errorMessage.textContent = "Email and password are required.";
    return;
  }

  // there is no backend connected yet, so this is just a placeholder
  // later this part will send the email and password to the server
  console.log("Login attempt with email: " + email);
  errorMessage.textContent = "Backend not connected yet - this is a frontend placeholder.";
});

// run this when "forgot password" is clicked
var forgotLink = document.getElementById("forgot-password-link");
forgotLink.addEventListener("click", function (event) {
  event.preventDefault();
  alert("Password reset is not built yet.");
});