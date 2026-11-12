const MIN_BIRTH_YEAR = 1900;

// 'YYYY-MM-DD' -> Date at UTC midnight, or null if invalid, in the future or before 1900.
function parseBirthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (date.getUTCFullYear() < MIN_BIRTH_YEAR || date.getTime() > Date.now()) return null;
  return date;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

const formatDate = (date) => (date ? dateFormat.format(date) : '');
const toInputDate = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');

module.exports = { parseBirthDate, formatDate, toInputDate };
