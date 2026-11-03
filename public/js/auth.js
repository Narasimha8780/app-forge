"use strict";
const $ = (id) => document.getElementById(id);
function mode() {
  const signup = location.hash === "#signup";
  $("signinPanel").hidden = signup;
  $("signupPanel").hidden = !signup;
}
$("showSignup").addEventListener("click", () => {
  location.hash = "signup";
});
$("showSignin").addEventListener("click", () => {
  location.hash = "signin";
});
window.addEventListener("hashchange", mode);
mode();
function submit(formId, endpoint, errorId) {
  $(formId).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector("button[type=submit]");
    const body = Object.fromEntries(new FormData(form));
    $(errorId).hidden = true;
    if (
      body.confirmPassword !== undefined &&
      body.password !== body.confirmPassword
    ) {
      $(errorId).textContent = "Passwords do not match.";
      $(errorId).hidden = false;
      return;
    }
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Please wait…";
    try {
      const response = await fetch("/api/auth/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to continue. Please try again.");
      if (endpoint === "register") {
        for (const key of [
          "devmatrix_token",
          "appforge_token",
          "devmatrix_user",
          "appforge_user",
        ])
          localStorage.removeItem(key);
        $("loginForm").elements.loginIdentifier.value = body.username;
        form.reset();
        button.disabled = false;
        button.textContent = label;
        location.hash = "signin";
        mode();
        $("signupSuccessDialog").showModal();
      } else {
        localStorage.setItem("devmatrix_token", data.token);
        location.href = "/dashboard";
      }
    } catch (e) {
      $(errorId).textContent = e.message;
      $(errorId).hidden = false;
      button.disabled = false;
      button.textContent = label;
    }
  });
}
submit("loginForm", "login", "loginError");
submit("registerForm", "register", "registerError");
const existing = localStorage.getItem("devmatrix_token");
if (existing)
  fetch("/api/auth/me", { headers: { Authorization: "Bearer " + existing } })
    .then((r) => {
      if (r.ok) location.replace("/dashboard");
    })
    .catch(() => {});

$("continueToLogin").addEventListener("click", () =>
  $("signupSuccessDialog").close(),
);
$("signupSuccessDialog").addEventListener("close", () =>
  $("loginForm").elements.password.focus(),
);
