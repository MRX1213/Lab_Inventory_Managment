const loginForm = document.getElementById("login-form");
const errorMessage = document.getElementById("error-message");
const forgotLink = document.getElementById("forgot-password-link");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    errorMessage.textContent = "Email and password are required.";
    return;
  }
  try {
    const { data } = await window.labApi.apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    window.labApi.setCsrfToken(data.csrfToken);
    sessionStorage.setItem(
      "displayUser",
      JSON.stringify({
        userId: data.user.userId,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        role: data.user.role,
      }),
    );
    window.location.href = "dashboard.html";
  } catch {
    errorMessage.textContent = "Incorrect email or password.";
  }
});

forgotLink.addEventListener("click", (event) => {
  event.preventDefault();
  errorMessage.textContent =
    "Password reset is not available — no email or SMS delivery is configured. Contact an Admin.";
});