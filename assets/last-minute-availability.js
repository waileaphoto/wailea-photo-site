(function () {
  const panel = document.querySelector('[data-last-minute-availability]');
  if (!panel) return;

  const apiBase = (window.WBW_CONFIG && window.WBW_CONFIG.apiBase) || '';
  if (!apiBase) return;

  const formatDate = (dateStr) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00-10:00`));

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
      .format(new Date(2020, 0, 1, hours, minutes));
  };

  const sessions = [
    ['first-half-sunset', 'First Half of Sunset'],
    ['last-half-sunset', 'Last Half of Sunset'],
    ['turquoise-water', 'Turquoise + Water Experience'],
    ['babymoon', 'Babymoon Maternity Experience'],
    ['sunrise-max', 'Sunrise with Max'],
  ];

  const hawaiiDate = (offsetDays) => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays));
    return base.toISOString().slice(0, 10);
  };

  async function existingAvailabilityFallback() {
    const wantedDates = Array.from({ length: 5 }, (_, index) => hawaiiDate(index));
    const months = [...new Set(wantedDates.map((date) => date.slice(0, 7)))];
    const results = await Promise.all(sessions.flatMap(([slug, name]) => months.map(async (month) => {
      const response = await fetch(`${apiBase}/api/availability?sessionType=${encodeURIComponent(slug)}&month=${month}`);
      if (!response.ok) throw new Error('Availability is temporarily unavailable');
      return { slug, name, data: await response.json() };
    })));
    const openings = [];
    results.forEach(({ slug, name, data }) => {
      (data.days || []).filter((day) => wantedDates.includes(day.date)).forEach((day) => {
        (day.slots || []).forEach((slot) => {
          const start = new Date(`${day.date}T${slot.startTime}:00-10:00`);
          if (start.getTime() <= Date.now() + 60 * 60 * 1000) return;
          openings.push({ sessionType: slug, sessionName: name, date: day.date, ...slot });
        });
      });
    });
    return openings.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }

  async function loadOpenings() {
    const response = await fetch(`${apiBase}/api/last-minute-availability`);
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data.openings) ? data.openings : [];
    }
    // The draft can use the already-live calendar endpoints until the consolidated
    // endpoint is deployed with the next booking-engine release.
    return existingAvailabilityFallback();
  }

  loadOpenings()
    .then((allOpenings) => {
      const openings = allOpenings.slice(0, 8);
      if (!openings.length) return;

      const list = panel.querySelector('[data-last-minute-list]');
      openings.forEach((opening) => {
        const item = document.createElement('article');
        item.className = 'last-minute-card';
        const spaces = opening.spotsLeft === 1 ? '1 space' : `${opening.spotsLeft} spaces`;
        item.innerHTML = `<div><span>${formatDate(opening.date)} · ${formatTime(opening.startTime)}</span><strong>${opening.sessionName}</strong><small>${spaces} currently open</small></div>`;
        const button = document.createElement('a');
        button.href = '#';
        button.className = 'last-minute-book';
        button.dataset.bookSession = opening.sessionType;
        button.dataset.sessionName = opening.sessionName;
        button.textContent = 'View calendar';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          if (typeof window.waileaTrack === 'function') {
            window.waileaTrack('last_minute_booking_click', { session_type: opening.sessionType, session_date: opening.date });
          }
          if (window.WaileaBookingWidget) {
            window.WaileaBookingWidget.open(opening.sessionType, opening.sessionName, {
              date: opening.date,
              startTime: opening.startTime,
            });
          }
        });
        item.appendChild(button);
        list.appendChild(item);
      });
      panel.hidden = false;
    })
    .catch(() => {
      // The section stays hidden rather than showing stale or invented availability.
    });
}());
