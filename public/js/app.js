// =========================================================
// DevMatrix - Landing Page Interactions & Contact API
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth state for navbar buttons
  checkAuthNavbar();

  // Contact Form Submission
  setupContactForm();
});

// Update navbar based on login status
function checkAuthNavbar() {
  const token = localStorage.getItem('devmatrix_token') || localStorage.getItem('appforge_token');
  const userJson = localStorage.getItem('devmatrix_user') || localStorage.getItem('appforge_user');
  const navAuthActions = document.getElementById('navAuthActions');

  if (token && userJson && navAuthActions) {
    try {
      const user = JSON.parse(userJson);
      navAuthActions.innerHTML = `
        <a href="/dashboard" class="btn-pill-primary">
          <i class='bx bxs-dashboard'></i>
          <span>Dashboard (${user.firstName || 'App'})</span>
        </a>
      `;
    } catch {
      // ignore
    }
  }
}

// Hero Simulator interactive toggle (Cloud vs On-Prem)
window.switchHeroTarget = function(type) {
  const cloudBtn = document.getElementById('heroCloudBtn');
  const onPremBtn = document.getElementById('heroOnPremBtn');
  const title = document.getElementById('heroTargetTitle');
  const pill = document.getElementById('heroTargetPill');

  if (type === 'cloud') {
    cloudBtn.classList.add('active');
    onPremBtn.classList.remove('active');
    title.textContent = 'Target: AWS ECS Fargate & Cloud Run';
    pill.innerHTML = `<i class='bx bx-check-circle'></i> Multi-Cloud Auto-Scale`;
  } else {
    onPremBtn.classList.add('active');
    cloudBtn.classList.remove('active');
    title.textContent = 'Target: On-Premises (Docker Swarm / Kubernetes)';
    pill.innerHTML = `<i class='bx bx-check-circle'></i> Bare-Metal / K8s`;
  }
};

// Contact Form Handler
function setupContactForm() {
  const form = document.getElementById('contactForm');
  const alertBox = document.getElementById('contactAlert');
  const submitBtn = document.getElementById('contactSubmitBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('cName').value.trim();
    const email = document.getElementById('cEmail').value.trim();
    const phone = document.getElementById('cPhone').value.trim();
    const preferredCloud = document.getElementById('cCloud').value;
    const message = document.getElementById('cMessage').value.trim();

    if (!name || !email || !message) {
      showAlert(alertBox, 'error', 'Please fill in your name, email, and message.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Sending...</span> <i class='bx bx-loader-alt bx-spin'></i>`;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          preferredCloud,
          message
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert(alertBox, 'success', data.message);
        form.reset();
      } else {
        showAlert(alertBox, 'error', data.error || 'Failed to submit message.');
      }
    } catch (err) {
      showAlert(alertBox, 'error', 'Connection error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Send Message</span> <i class='bx bx-paper-plane'></i>`;
    }
  });
}

function showAlert(elem, type, message) {
  elem.style.display = 'block';
  if (type === 'success') {
    elem.style.background = 'rgba(16, 185, 129, 0.15)';
    elem.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    elem.style.color = '#065f46';
  } else {
    elem.style.background = 'rgba(239, 68, 68, 0.15)';
    elem.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    elem.style.color = '#991b1b';
  }
  elem.textContent = message;
}

