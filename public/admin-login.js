const form = $('login');
const field = $('password');
const error = $('login-error');

function fail(message) {
  error.textContent = message;
  error.hidden = false;
  field.classList.remove('shake');
  void field.offsetWidth;
  field.classList.add('shake');
  field.focus();
  field.select();
}

$('reveal').addEventListener('click', () => {
  const hidden = field.type === 'password';
  field.type = hidden ? 'text' : 'password';
  $('reveal').textContent = hidden ? 'Hide' : 'Show';
  $('reveal').setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  if (!field.value) {
    fail('Enter the admin password.');
    return;
  }

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: field.value }) });
    location.href = '/admin/';
  } catch (err) {
    fail(err.message);
    submit.disabled = false;
  }
});

async function init() {
  const session = await api('/api/admin/session').catch(() => null);
  if (session && (!session.required || session.signedIn)) {
    location.href = '/admin/';
    return;
  }
  const config = await api('/api/config').catch(() => null);
  if (config) {
    $('business').textContent = config.businessName;
    document.title = `${config.businessName} admin sign in`;
  }
  rollify();
}

init();
