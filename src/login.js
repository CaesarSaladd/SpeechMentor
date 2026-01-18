import { loginUser, signupUser, authErrorMessage } from "./authentication.js";

function initAuthUI() {
  console.log("login.js loaded");

  // DOM Elements
  const alertEl = document.getElementById("authAlert");
  const loginView = document.getElementById("loginView");
  const signupView = document.getElementById("signupView");
  const toSignupBtn = document.getElementById("toSignup");
  const toLoginBtn = document.getElementById("toLogin");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const redirectUrl = "../index.html";

  console.log({
    alertEl: !!alertEl,
    loginView: !!loginView,
    signupView: !!signupView,
    toSignupBtn: !!toSignupBtn,
    toLoginBtn: !!toLoginBtn,
    loginForm: !!loginForm,
    signupForm: !!signupForm,
  });

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function showError(msg) {
    console.log("showError:", msg);
    if (!alertEl) {
      window.alert(msg || "");
      return;
    }
    alertEl.textContent = msg || "";
    alertEl.classList.remove("hidden");
  }

  function hideError() {
    if (!alertEl) return;
    alertEl.classList.add("hidden");
    alertEl.textContent = "";
  }

  function setSubmitDisabled(form, disabled) {
    const submitBtn = form?.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = disabled;
  }

  function goToLoginView() {
    console.log("➡️ Switching to LOGIN view");
    setVisible(signupView, false);
    setVisible(loginView, true);
    setTimeout(() => document.querySelector("#loginEmail")?.focus(), 0);
  }

  function goToSignupView() {
    console.log("➡️ Switching to SIGNUP view");
    setVisible(loginView, false);
    setVisible(signupView, true);
    setTimeout(() => document.querySelector("#signupName")?.focus(), 0);
  }

  // Toggle buttons
  toSignupBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hideError();
    goToSignupView();
  });

  toLoginBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hideError();
    goToLoginView();
  });

  // Login submit
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    console.log("✅ login submit fired");

    const email = document.querySelector("#loginEmail")?.value?.trim() ?? "";
    const password = document.querySelector("#loginPassword")?.value ?? "";

    if (!email || !password) {
      showError("Please enter your email and password.");
      return;
    }

    setSubmitDisabled(loginForm, true);

    try {
      await loginUser(email, password);
      console.log("loginUser success");

      const redirect =
        sessionStorage.getItem("afterLoginRedirect") || redirectUrl;

      sessionStorage.removeItem("afterLoginRedirect");
      location.href = redirect;
    } catch (err) {
      console.log("❌ loginUser error", err);
      showError(authErrorMessage(err));
    } finally {
      setSubmitDisabled(loginForm, false);
    }
  });

  // Signup submit
  signupForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    console.log("signup submit fired");
    window.alert("Signup submit fired"); // THIS MUST POP UP

    const name = document.querySelector("#signupName")?.value?.trim() ?? "";
    const email = document.querySelector("#signupEmail")?.value?.trim() ?? "";
    const password = document.querySelector("#signupPassword")?.value ?? "";

    if (!name || !email || !password) {
      showError("Please ensure all fields are filled.");
      return;
    }

    setSubmitDisabled(signupForm, true);

    try {
      console.log("⏳ calling signupUser...");
      await signupUser(name, email, password);
      console.log("✅ signupUser success");

      window.alert("✅ Signup successful! Now log in.");
      goToLoginView();

      const loginEmailEl = document.querySelector("#loginEmail");
      if (loginEmailEl) loginEmailEl.value = email;

      // clear signup fields
      const n = document.querySelector("#signupName");
      const em = document.querySelector("#signupEmail");
      const pw = document.querySelector("#signupPassword");
      if (n) n.value = "";
      if (em) em.value = "";
      if (pw) pw.value = "";
    } catch (err) {
      console.log("signupUser error", err);
      showError(authErrorMessage(err));
    } finally {
      setSubmitDisabled(signupForm, false);
    }
  });
}

document.addEventListener("DOMContentLoaded", initAuthUI);
