// Aplica el tema antes del primer render sin requerir JavaScript inline.
if (localStorage.getItem('vpn_dark_mode') === 'true') {
  document.documentElement.classList.add('dark');
}
