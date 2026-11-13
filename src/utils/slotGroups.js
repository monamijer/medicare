const { formatDay, formatTime, dayKey } = require('./time');

// Slots (sorted by start) -> [{ label: 'jeudi 12 novembre 2026', slots: [{ id, time, status }] }]
function groupSlotsByDay(slots) {
  const groups = [];
  for (const slot of slots) {
    const key = dayKey(slot.start);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: formatDay(slot.start), slots: [] };
      groups.push(group);
    }
    group.slots.push({ id: String(slot._id), time: `${formatTime(slot.start)} – ${formatTime(slot.end)}`, status: slot.status });
  }
  return groups;
}

module.exports = { groupSlotsByDay };
