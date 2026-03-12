/* Card rendering utilities */

function renderCard(card) {
  if (!card || card.hidden) {
    return '<div class="playing-card card-back"></div>';
  }
  const colorClass = card.isRed ? 'red' : 'black';
  const suit = card.suit;
  const rank = card.rank;
  return `<div class="playing-card ${colorClass}">
    <div class="card-top">${rank}<br>${suit}</div>
    <div class="card-center">${suit}</div>
    <div class="card-bottom">${rank}<br>${suit}</div>
  </div>`;
}

function renderCardRow(cards, emptySlots = 0) {
  let html = '';
  for (const c of cards) html += renderCard(c);
  for (let i = 0; i < emptySlots; i++) {
    html += '<div class="card-placeholder"></div>';
  }
  return html;
}
