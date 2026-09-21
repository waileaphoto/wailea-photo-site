// Price-vs-images explorer for the pricing page.
//
// Reads its data from the <table> inside the "How we checked this" panel rather than
// carrying its own copy. That table is the single source of truth: a reader auditing the
// figures and the plot drawn above them can never disagree, and with JavaScript off the
// data is still there as a plain HTML table for people, crawlers and assistants.
//
// Nothing here invents a number. Every value comes from a data-price / data-images
// attribute on a real row, and rows without both are simply not plotted — they stay in
// the table marked "not stated", which is the honest reason they're missing.

(function () {
  const section = document.querySelector('.market-range');
  if (!section) return;

  const slider = document.getElementById('budgetSlider');
  const out = document.getElementById('budgetOut');
  const readout = document.getElementById('budgetReadout');
  const plotHost = document.getElementById('marketPlot');
  const rowsBody = document.getElementById('marketRows');
  if (!slider || !plotHost || !rowsBody) return;

  // --- read the table ---------------------------------------------------
  const records = Array.from(rowsBody.querySelectorAll('tr')).map((tr) => {
    const priceCell = tr.querySelector('[data-price]');
    const imagesCell = tr.querySelector('[data-images]');
    return {
      label: (tr.cells[0]?.textContent || '').trim(),
      price: priceCell ? Number(priceCell.dataset.price) : null,
      images: imagesCell ? Number(imagesCell.dataset.images) : null,
      isUs: tr.classList.contains('market-row-us'),
      row: tr,
    };
  });

  // Only rows publishing BOTH figures can be placed on a price-vs-images plot.
  const plotted = records.filter((r) => Number.isFinite(r.price) && Number.isFinite(r.images));
  const us = plotted.find((r) => r.isUs);
  if (!us || plotted.length < 2) return;

  const fmt = (n) => `$${Number(n).toLocaleString('en-US')}`;

  // --- geometry ---------------------------------------------------------
  const PAD = { top: 18, right: 18, bottom: 34, left: 44 };
  const minPrice = Math.min(...plotted.map((r) => r.price));
  const maxPrice = Math.max(...plotted.map((r) => r.price));
  const maxImages = Math.max(...plotted.map((r) => r.images));
  const yTop = Math.ceil((maxImages + 6) / 10) * 10;

  function render(budget) {
    const w = Math.max(320, plotHost.clientWidth || 560);
    const h = Math.round(Math.min(340, Math.max(230, w * 0.52)));
    const innerW = w - PAD.left - PAD.right;
    const innerH = h - PAD.top - PAD.bottom;

    const x = (p) => PAD.left + ((p - minPrice) / (maxPrice - minPrice)) * innerW;
    const y = (i) => PAD.top + innerH - (i / yTop) * innerH;

    const parts = [];
    parts.push(
      `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" ` +
      `aria-label="Published Maui session prices plotted against the number of edited images included. ` +
      `Wailea Photo is at ${fmt(us.price)} for ${us.images} images.">`
    );

    // horizontal gridlines + y labels
    for (let i = 0; i <= yTop; i += 10) {
      parts.push(
        `<line x1="${PAD.left}" y1="${y(i)}" x2="${w - PAD.right}" y2="${y(i)}" class="mp-grid"/>`,
        `<text x="${PAD.left - 8}" y="${y(i) + 4}" class="mp-axis mp-axis-y">${i}</text>`
      );
    }

    // x axis labels at the ends
    parts.push(
      `<text x="${PAD.left}" y="${h - 12}" class="mp-axis">${fmt(minPrice)}</text>`,
      `<text x="${w - PAD.right}" y="${h - 12}" class="mp-axis mp-axis-end">${fmt(maxPrice)}</text>`,
      `<text x="${PAD.left - 34}" y="${PAD.top - 6}" class="mp-axis">images</text>`
    );

    // budget line
    const bx = x(Math.min(Math.max(budget, minPrice), maxPrice));
    parts.push(
      `<line x1="${bx}" y1="${PAD.top - 6}" x2="${bx}" y2="${PAD.top + innerH}" class="mp-budget"/>`,
      `<text x="${bx}" y="${PAD.top - 9}" class="mp-budget-label" text-anchor="middle">${fmt(budget)}</text>`
    );

    // dots — anything over budget dims rather than disappearing, so the shape of the
    // whole market stays visible while the affordable part is picked out.
    plotted.forEach((r) => {
      const affordable = r.price <= budget;
      const cls = [
        'mp-dot',
        r.isUs ? 'mp-dot-us' : '',
        affordable ? '' : 'mp-dot-out',
      ].filter(Boolean).join(' ');
      parts.push(
        `<circle cx="${x(r.price)}" cy="${y(r.images)}" r="${r.isUs ? 8 : 5.5}" class="${cls}">` +
        `<title>${r.isUs ? 'Wailea Photo' : 'Photographer ' + r.label} — ${fmt(r.price)}, ${r.images} edited images</title>` +
        `</circle>`
      );
    });

    // label our dot
    parts.push(
      `<text x="${x(us.price)}" y="${y(us.images) - 15}" class="mp-us-label" text-anchor="middle">Wailea Photo</text>`
    );

    parts.push('</svg>');
    plotHost.innerHTML = parts.join('');
  }

  // --- readout ----------------------------------------------------------
  function describe(budget) {
    const inReach = plotted.filter((r) => r.price <= budget);
    const others = inReach.filter((r) => !r.isUs);
    const weFit = us.price <= budget;

    if (!inReach.length) {
      // There may well be cheaper sessions than anything on the plot — they just don't
      // say how many edited images you get, so they can't be placed on it. Saying
      // "nothing is available" here would be flatly untrue; this says what's actually so.
      const cheapestOverall = records
        .filter((r) => Number.isFinite(r.price))
        .reduce((a, b) => (b.price < a.price ? b : a));
      const cheaperUnpriced = records.filter(
        (r) => Number.isFinite(r.price) && !Number.isFinite(r.images) && r.price <= budget
      ).length;
      if (cheaperUnpriced) {
        return `At ${fmt(budget)}, the only Maui sessions we found in reach don't publish how many ` +
          `edited images you receive, so they can't be compared here. The cheapest that does is ` +
          `${fmt(minPrice)}. Ours is ${fmt(us.price)} for ${us.images}+.`;
      }
      return `Nothing we found is published below ${fmt(budget)} — the lowest price on Maui we ` +
        `could find is ${fmt(cheapestOverall.price)}.`;
    }
    if (!weFit) {
      const best = others.reduce((a, b) => (b.images > a.images ? b : a));
      return `At ${fmt(budget)}, ${others.length} of the ${plotted.length} published sessions are in reach. ` +
        `The most edited images any of them includes is ${best.images}. ` +
        `Ours is ${fmt(us.price)} for ${us.images}+.`;
    }
    const bestOther = others.length ? others.reduce((a, b) => (b.images > a.images ? b : a)) : null;
    const lead = bestOther ? us.images - bestOther.images : null;
    let text = `At ${fmt(budget)}, ${inReach.length} of the ${plotted.length} published sessions are in reach, ours among them.`;
    if (bestOther && lead > 0) {
      text += ` The next most generous includes ${bestOther.images} edited images; ours includes ${us.images}+ — ${lead} more.`;
    } else if (bestOther) {
      text += ` The most edited images any of them includes is ${bestOther.images}.`;
    }
    return text;
  }

  function update() {
    const budget = Number(slider.value);
    if (out) out.textContent = fmt(budget);
    if (readout) readout.textContent = describe(budget);
    render(budget);
    // Track the fill so the slider reads as a gauge rather than a bare control.
    const pct = ((budget - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--fill', pct + '%');
    // Highlight the matching rows in the table below.
    records.forEach((r) => {
      if (!Number.isFinite(r.price)) return;
      r.row.classList.toggle('market-row-out', r.price > budget);
    });
  }

  slider.addEventListener('input', update);
  window.addEventListener('resize', () => render(Number(slider.value)), { passive: true });
  update();
})();
