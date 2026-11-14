const ROLE_LABELS = {
  admin: 'Administrateur',
  doctor: 'Médecin',
  patient: 'Patient',
};

const NAVIGATION = {
  admin: [
    { href: '/', label: 'Accueil', icon: 'layout-dashboard' },
    { href: '/appointments/day', label: 'Agenda du jour', icon: 'calendar-check' },
    { href: '/appointments', label: 'Rendez-vous', icon: 'calendar-days' },
    { href: '/doctors', label: 'Médecins', icon: 'stethoscope' },
    { href: '/patients', label: 'Patients', icon: 'users' },
    { href: '/availability', label: 'Disponibilités', icon: 'clock' },
    { href: '/specialties', label: 'Spécialités', icon: 'tags' },
    { href: '/users', label: 'Utilisateurs', icon: 'settings' },
  ],
  doctor: [
    { href: '/', label: 'Accueil', icon: 'layout-dashboard' },
    { href: '/appointments/day', label: 'Agenda du jour', icon: 'calendar-check' },
    { href: '/appointments', label: 'Mes rendez-vous', icon: 'calendar-days' },
    { href: '/availability', label: 'Mes disponibilités', icon: 'clock' },
  ],
  patient: [
    { href: '/', label: 'Accueil', icon: 'layout-dashboard' },
    { href: '/appointments/new', label: 'Prendre rendez-vous', icon: 'plus' },
    { href: '/appointments', label: 'Mes rendez-vous', icon: 'calendar-days' },
    { href: '/profile', label: 'Mon profil', icon: 'user-round' },
  ],
};

function matches(href, path) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

// Returns the role's menu with `active` set on the single best (longest) match.
function getNavigation(role, path) {
  const items = NAVIGATION[role] || [];
  const best = items
    .filter((item) => matches(item.href, path))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return items.map((item) => ({ ...item, active: item === best }));
}

module.exports = { ROLE_LABELS, getNavigation };
