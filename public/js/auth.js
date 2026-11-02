// =========================================================
// DevMatrix - Auth Logic (Video 1 Sliding Controller & API)
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('authContainer');
  const toSignupLink = document.getElementById('toSignupLink');
  const toSigninLink = document.getElementById('toSigninLink');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const loginAlert = document.getElementById('loginAlert');
  const registerAlert = document.getElementById('registerAlert');

  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const registerSubmitBtn = document.getElementById('registerSubmitBtn');

  // Check if user is already signed in
  const existingToken = localStorage.getItem('devmatrix_token') || localStorage.getItem('appforge_token');
  if (existingToken) {
    // Verify token validity
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${existingToken}` }
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        window.location.href = '/dashboard';
      }
    })
    .catch(() => {});
  }

  // Check URL hash for direct mode
  if (window.location.hash === '#signup' || window.location.search.includes('mode=signup')) {
    container.classList.add('active');
  }

  // Toggle Sliding Panels
  toSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    clearAlerts();
    container.classList.add('active');
    history.replaceState(null, null, '#signup');
  });

  toSigninLink.addEventListener('click', (e) => {
    e.preventDefault();
    clearAlerts();
    container.classList.remove('active');
    history.replaceState(null, null, '#login');
  });

  function clearAlerts() {
    loginAlert.className = 'form-alert';
    loginAlert.textContent = '';
    registerAlert.className = 'form-alert';
    registerAlert.textContent = '';
  }

  function showAlert(elem, type, message) {
    elem.className = `form-alert ${type}`;
    elem.textContent = message;
    elem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Handle Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const loginIdentifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!loginIdentifier || !password) {
      showAlert(loginAlert, 'error', 'Please provide your identifier and password.');
      return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerHTML = `<span>Signing In...</span> <i class='bx bx-loader-alt bx-spin'></i>`;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginIdentifier, password })
      });

      const data = await response.json();

      if (data.success) {
        showAlert(loginAlert, 'success', 'Login successful! Redirecting to dashboard...');
        localStorage.setItem('devmatrix_token', data.token);
        localStorage.setItem('devmatrix_user', JSON.stringify(data.user));

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 800);
      } else {
        showAlert(loginAlert, 'error', data.error || 'Authentication failed. Please verify credentials.');
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerHTML = `<span>Login</span> <i class='bx bx-right-arrow-alt'></i>`;
      }
    } catch (err) {
      showAlert(loginAlert, 'error', 'Network error. Please ensure the server is running.');
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.innerHTML = `<span>Login</span> <i class='bx bx-right-arrow-alt'></i>`;
    }
  });

  // Handle Registration Submit
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!firstName || !lastName) {
      showAlert(registerAlert, 'error', 'First name and Last name are required.');
      return;
    }
    if (username.length < 3) {
      showAlert(registerAlert, 'error', 'Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      showAlert(registerAlert, 'error', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert(registerAlert, 'error', 'Passwords do not match. Please verify.');
      return;
    }

    registerSubmitBtn.disabled = true;
    registerSubmitBtn.innerHTML = `<span>Registering...</span> <i class='bx bx-loader-alt bx-spin'></i>`;

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          username,
          email,
          mobile,
          password,
          confirmPassword
        })
      });

      const data = await response.json();

      if (data.success) {
        showAlert(registerAlert, 'success', 'Account registered successfully! Redirecting to dashboard...');
        localStorage.setItem('devmatrix_token', data.token);
        localStorage.setItem('devmatrix_user', JSON.stringify(data.user));

        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 900);
      } else {
        showAlert(registerAlert, 'error', data.error || 'Registration failed.');
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.innerHTML = `<span>Create Account</span> <i class='bx bx-user-plus'></i>`;
      }
    } catch (err) {
      showAlert(registerAlert, 'error', 'Network error. Please try again.');
      registerSubmitBtn.disabled = false;
      registerSubmitBtn.innerHTML = `<span>Create Account</span> <i class='bx bx-user-plus'></i>`;
    }
  });
});

