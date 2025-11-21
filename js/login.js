// Demo login logic for index.html
(function () {
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('errorBox');
  const themeToggle = document.getElementById('themeToggle');

  // Load saved theme
  const savedTheme = localStorage.getItem('rushradar_theme') || 'dark';
  document.body.classList.toggle('theme-light', savedTheme === 'light');
  themeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';

  themeToggle.addEventListener('click', () => {
    const nowLight = !document.body.classList.contains('theme-light');
    document.body.classList.toggle('theme-light', nowLight);
    localStorage.setItem('rushradar_theme', nowLight ? 'light' : 'dark');
    themeToggle.textContent = nowLight ? '🌙' : '☀️';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    // Demo credentials (hard-coded). Replace this with backend auth when ready:
    // POST /api/login -> returns { success: true } and session token
    if (user === 'demo1' && pass === '1234') {
      localStorage.setItem('rushradar_isLoggedIn', '1');
      // store demo user if needed:
      localStorage.setItem('rushradar_user', user);
      window.location.href = 'dashboard.html';
    } else {
      errorBox.textContent = 'Invalid username or password';
      errorBox.classList.remove('hidden');
    }
  });
})();