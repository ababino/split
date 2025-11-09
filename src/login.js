const form = document.getElementById('login-form');
const errorDiv = document.getElementById('error');

async function handleLogin(event) {
  event.preventDefault();
  errorDiv.textContent = '';
  const formData = new FormData(form);
  const payload = {
    username: String(formData.get('username') || ''),
    password: String(formData.get('password') || ''),
  };
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 204) {
      window.location.href = '/';
      return;
    }
    if (res.status === 401) {
      errorDiv.textContent = 'Invalid username or password';
      return;
    }
    errorDiv.textContent = 'Unexpected error. Please try again.';
  } catch (err) {
    errorDiv.textContent = 'Network error. Please try again.';
  }
}

form?.addEventListener('submit', handleLogin);




