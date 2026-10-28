'use strict';

const socket = io();

// ---- State ----
let myId = null;
let isOrganizer = false;
let currentGame = null;
let myActions = [];

// Single-player game selection state
let solSelected = null; // { type, col, cardIndex } | null
let fcSelected = null;  // { type, col, cell, cardIndex } | null

// ---- Bootstrap ----
const cachedState = sessionStorage.getItem('roomState');
if (!cachedState) {
  window.location.href = '/';
}
const initialState = JSON.parse(cachedState);
sessionStorage.removeItem('roomState');

// ---- DOM refs ----
const roomIdEl = document.getElementById('room-id');
const playerBadgeEl = document.getElementById('player-badge');
const btnCopy = document.getElementById('btn-copy-code');

// Views
const viewLobby = document.getElementById('view-lobby');
const viewBJ = document.getElementById('view-blackjack');
const viewPoker = document.getElementById('view-poker');
const viewSolitaire = document.getElementById('view-solitaire');
const viewFreeCell = document.getElementById('view-freecell');

// Lobby
const playerListEl = document.getElementById('player-list');
const playerCountEl = document.getElementById('player-count');
const organizerControls = document.getElementById('organizer-controls');
const btnAddBot = document.getElementById('btn-add-bot');
const gameOptions = document.querySelectorAll('.game-option');
const startArea = document.getElementById('start-area');
const btnStart = document.getElementById('btn-start');
const waitingMsg = document.getElementById('waiting-msg');
const gameHintEl = document.getElementById('game-hint');

// Blackjack
const bjMessageEl = document.getElementById('bj-message');
const bjDealerHandEl = document.getElementById('bj-dealer-hand');
const bjDealerValueEl = document.getElementById('bj-dealer-value');
const bjPlayersAreaEl = document.getElementById('bj-players-area');
const bjActionsEl = document.getElementById('bj-actions');
const bjBetControlEl = document.getElementById('bj-bet-control');
const bjPlayActionsEl = document.getElementById('bj-play-actions');
const bjBetAmountEl = document.getElementById('bj-bet-amount');
const btnBjBet = document.getElementById('btn-bj-bet');
const btnBjHit = document.getElementById('btn-bj-hit');
const btnBjStand = document.getElementById('btn-bj-stand');
const btnBjDouble = document.getElementById('btn-bj-double');
const bjRoundOverEl = document.getElementById('bj-round-over');
const bjOrganizerNextEl = document.getElementById('bj-organizer-next');
const bjWaitingNextEl = document.getElementById('bj-waiting-next');
const btnBjNext = document.getElementById('btn-bj-next');
const btnBjLobby = document.getElementById('btn-bj-lobby');

// Poker
const pokerMessageEl = document.getElementById('poker-message');
const pokerPotEl = document.getElementById('poker-pot');
const pokerCommunityEl = document.getElementById('poker-community');
const pokerHandNameEl = document.getElementById('poker-hand-name');
const pokerPlayersAreaEl = document.getElementById('poker-players-area');
const pokerActionsEl = document.getElementById('poker-actions');
const btnPokerFold = document.getElementById('btn-poker-fold');
const btnPokerCheckCall = document.getElementById('btn-poker-check-call');
const pokerRaiseGroupEl = document.getElementById('poker-raise-group');
const pokerRaiseAmountEl = document.getElementById('poker-raise-amount');
const btnPokerRaise = document.getElementById('btn-poker-raise');
const btnPokerAllin = document.getElementById('btn-poker-allin');
const pokerHandOverEl = document.getElementById('poker-hand-over');
const pokerShowdownInfoEl = document.getElementById('poker-showdown-info');
const pokerOrganizerNextEl = document.getElementById('poker-organizer-next');
const pokerWaitingNextEl = document.getElementById('poker-waiting-next');
const btnPokerNext = document.getElementById('btn-poker-next');
const btnPokerLobby = document.getElementById('btn-poker-lobby');

// Solitaire
const solMessageEl = document.getElementById('sol-message');
const solStockEl = document.getElementById('sol-stock');
const solWasteEl = document.getElementById('sol-waste');
const solFoundationsEl = document.getElementById('sol-foundations');
const solTableauEl = document.getElementById('sol-tableau');
const solMovesEl = document.getElementById('sol-moves');
const btnSolNew = document.getElementById('btn-sol-new');
const btnSolLobby = document.getElementById('btn-sol-lobby');

// FreeCell
const fcMessageEl = document.getElementById('fc-message');
const fcFreeCellsEl = document.getElementById('fc-freecells');
const fcHomeEl = document.getElementById('fc-home');
const fcCascadesEl = document.getElementById('fc-cascades');
const fcMovesEl = document.getElementById('fc-moves');
const btnFcNew = document.getElementById('btn-fc-new');
const btnFcLobby = document.getElementById('btn-fc-lobby');

const errorToast = document.getElementById('room-error');

// ---- Utility ----
function showView(name) {
  for (const v of document.querySelectorAll('#main-area > .view')) {
    v.classList.remove('active');
  }
  if (name === 'lobby') viewLobby.classList.add('active');
  else if (name === 'blackjack') viewBJ.classList.add('active');
  else if (name === 'poker') viewPoker.classList.add('active');
  else if (name === 'solitaire') viewSolitaire.classList.add('active');
  else if (name === 'freecell') viewFreeCell.classList.add('active');
  else if (name === 'tricks') viewTricks.classList.add('active');
  else if (name === 'crazyeights') viewCrazyEights.classList.add('active');
}

function showError(msg) {
  errorToast.textContent = msg;
  errorToast.classList.remove('hidden');
  setTimeout(() => errorToast.classList.add('hidden'), 3500);
}

function chips(n) {
  return n.toLocaleString();
}

// ---- Copy room code ----
btnCopy.addEventListener('click', () => {
  const code = roomIdEl.textContent;
  navigator.clipboard.writeText(code).then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => btnCopy.textContent = 'Copy', 1500);
  }).catch(() => {
    btnCopy.textContent = code;
    setTimeout(() => btnCopy.textContent = 'Copy', 2500);
  });
});

// ============================================================
// LOBBY RENDERING
// ============================================================
function renderLobby(state) {
  const { players, selectedGame, organizerId } = state;
  myId = state.myId;
  isOrganizer = state.isOrganizer;

  playerCountEl.textContent = `(${players.length})`;
  playerListEl.innerHTML = '';

  for (const p of players) {
    const isMe = p.id === myId;
    const isOrg = p.id === organizerId;
    let tags = '';
    if (isOrg) tags += '<span class="player-tag tag-organizer">Host</span>';
    if (isMe) tags += '<span class="player-tag tag-you">You</span>';
    if (p.isComputer) tags += '<span class="player-tag tag-bot">Bot</span>';
    let removeBtn = '';
    if (isOrganizer && !isMe && !isOrg) {
      removeBtn = `<button class="btn-remove" data-id="${p.id}" title="Remove player">✕</button>`;
    }
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `<span class="player-name">${esc(p.name)}</span><div style="display:flex;gap:6px;align-items:center">${tags}${removeBtn}</div>`;
    playerListEl.appendChild(li);
  }

  playerListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('remove_player', { playerId: btn.dataset.id });
    });
  });

  const isSinglePlayer = ['solitaire', 'freecell'].includes(selectedGame);

  if (isOrganizer) {
    organizerControls.classList.remove('hidden');
    startArea.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
    btnStart.disabled = !selectedGame;
    // Hide "Add Computer" for single-player games
    btnAddBot.classList.toggle('hidden', isSinglePlayer);
  } else {
    organizerControls.classList.add('hidden');
    startArea.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }

  const isFourPlayer = ['hearts', 'spades'].includes(selectedGame);
  if (isFourPlayer) {
    gameHintEl.textContent = players.length > 4
      ? 'This game needs exactly 4 players — remove some to start.'
      : players.length < 4
        ? `Exactly 4 players — ${4 - players.length} empty seat${players.length === 3 ? '' : 's'} will be filled by bots.`
        : '';
  } else {
    gameHintEl.textContent = '';
  }
  gameHintEl.classList.toggle('hidden', !gameHintEl.textContent);

  gameOptions.forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.game === selectedGame);
    opt.style.pointerEvents = isOrganizer ? '' : 'none';
  });
}

// ============================================================
// BLACKJACK RENDERING
// ============================================================
function renderBlackjack(gs) {
  myActions = gs.myActions || [];

  bjMessageEl.textContent = gs.message || '';

  bjDealerHandEl.innerHTML = renderCardRow(gs.dealer.hand);
  bjDealerValueEl.textContent = gs.dealer.value > 0 ? `Value: ${gs.dealer.value}` : '';

  bjPlayersAreaEl.innerHTML = '';
  for (const p of gs.players) {
    const div = document.createElement('div');
    div.className = 'bj-player-card' +
      (p.isCurrentPlayer ? ' is-current' : '') +
      (p.isMe ? ' is-me' : '');

    let statusLabel = p.status;
    let statusClass = 'status-' + (p.result || p.status);
    if (p.result) statusLabel = p.result.toUpperCase();
    else if (p.status === 'bet_placed') statusLabel = `Bet: ${chips(p.bet)}`;
    else if (p.status === 'betting') statusLabel = 'Betting…';

    div.innerHTML = `
      <div class="bj-player-header">
        <span class="bj-player-name">${esc(p.name)}${p.isMe ? ' (You)' : ''}${p.isComputer ? ' 🤖' : ''}</span>
        <span class="bj-player-chips">${chips(p.chips)} chips</span>
      </div>
      <div class="card-row">${renderCardRow(p.hand)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="bj-player-bet">${p.bet > 0 ? `Bet: ${chips(p.bet)}${p.doubled ? ' (doubled)' : ''}` : ''}</span>
        <span class="bj-status-badge ${statusClass}">${p.handValue > 0 ? p.handValue + ' — ' : ''}${statusLabel}</span>
      </div>`;
    bjPlayersAreaEl.appendChild(div);
  }

  const hasBet = myActions.includes('bet');
  const hasHit = myActions.includes('hit');
  const hasDouble = myActions.includes('double');

  if (hasBet) {
    bjActionsEl.classList.remove('hidden');
    bjBetControlEl.classList.remove('hidden');
    bjPlayActionsEl.classList.add('hidden');
  } else if (hasHit) {
    bjActionsEl.classList.remove('hidden');
    bjBetControlEl.classList.add('hidden');
    bjPlayActionsEl.classList.remove('hidden');
    btnBjDouble.classList.toggle('hidden', !hasDouble);
  } else {
    bjActionsEl.classList.add('hidden');
  }

  if (gs.phase === 'round_over') {
    bjRoundOverEl.classList.remove('hidden');
    if (isOrganizer) {
      bjOrganizerNextEl.classList.remove('hidden');
      bjWaitingNextEl.classList.add('hidden');
    } else {
      bjOrganizerNextEl.classList.add('hidden');
      bjWaitingNextEl.classList.remove('hidden');
    }
  } else {
    bjRoundOverEl.classList.add('hidden');
  }
}

// ============================================================
// POKER RENDERING
// ============================================================
function renderPoker(gs) {
  myActions = gs.myActions || [];

  pokerMessageEl.textContent = gs.message || '';
  pokerPotEl.textContent = chips(gs.pot || 0);

  const emptySlots = Math.max(0, 5 - (gs.communityCards || []).length);
  pokerCommunityEl.innerHTML = renderCardRow(gs.communityCards || [], emptySlots);

  pokerHandNameEl.textContent = gs.myHand || '';

  pokerPlayersAreaEl.innerHTML = '';
  for (const p of gs.players) {
    const isDealer = gs.dealerId === p.id;
    const isSB = gs.sbId === p.id;
    const isBB = gs.bbId === p.id;
    const isFolded = p.status === 'folded';
    const isAllin = p.status === 'allin';

    let badges = '';
    if (isDealer) badges += '<span class="badge badge-dealer">D</span>';
    if (isSB) badges += '<span class="badge badge-sb">SB</span>';
    if (isBB) badges += '<span class="badge badge-bb">BB</span>';
    if (isFolded) badges += '<span class="badge badge-folded">Fold</span>';
    if (isAllin) badges += '<span class="badge badge-allin">All In</span>';

    const cardsHtml = renderCardRow(p.hand);

    const div = document.createElement('div');
    div.className = 'poker-player-card' +
      (p.isCurrentPlayer ? ' is-current' : '') +
      (p.isMe ? ' is-me' : '') +
      (isFolded ? ' is-folded' : '');

    div.innerHTML = `
      <div class="poker-player-header">
        <span class="poker-player-name">${esc(p.name)}${p.isMe ? ' (You)' : ''}${p.isComputer ? ' 🤖' : ''}</span>
        <span class="poker-player-chips">${chips(p.chips)}</span>
      </div>
      <div class="poker-player-badges">${badges}</div>
      <div class="card-row">${cardsHtml}</div>
      ${p.streetBet > 0 ? `<div class="poker-player-bet">Bet: ${chips(p.streetBet)}</div>` : ''}
      ${p.lastAction ? `<div class="last-action">${p.lastAction}</div>` : ''}`;
    pokerPlayersAreaEl.appendChild(div);
  }

  const canAct = myActions.length > 0;
  if (canAct) {
    pokerActionsEl.classList.remove('hidden');
    const toCallAction = myActions.find(a => a.startsWith('call '));
    if (toCallAction) {
      btnPokerCheckCall.textContent = `Call ${toCallAction.replace('call ', '')}`;
    } else {
      btnPokerCheckCall.textContent = 'Check';
    }
    const canRaise = myActions.includes('raise');
    pokerRaiseGroupEl.classList.toggle('hidden', !canRaise);
    if (canRaise) {
      const minRaise = gs.minRaise || 50;
      const minTotal = gs.currentBet + minRaise;
      pokerRaiseAmountEl.min = minTotal;
      pokerRaiseAmountEl.step = 10;
      if (!pokerRaiseAmountEl.value || Number(pokerRaiseAmountEl.value) < minTotal) {
        pokerRaiseAmountEl.value = minTotal;
      }
    }
  } else {
    pokerActionsEl.classList.add('hidden');
  }

  if (gs.phase === 'hand_over') {
    pokerHandOverEl.classList.remove('hidden');

    if (gs.showdownInfo && gs.showdownInfo.length > 0) {
      let html = '<div class="showdown-results">';
      for (const entry of gs.showdownInfo) {
        html += `<div class="showdown-player${entry.isWinner ? ' winner' : ''}">
          <div class="showdown-player-name">${esc(entry.name)}</div>
          <div class="showdown-hand-name">${entry.handName || ''}</div>
          <div class="card-row" style="justify-content:center;margin:6px 0">${renderCardRow(entry.hand)}</div>
          ${entry.won > 0 ? `<div class="showdown-won">+${chips(entry.won)}</div>` : ''}
        </div>`;
      }
      html += '</div>';
      pokerShowdownInfoEl.innerHTML = html;
    } else {
      pokerShowdownInfoEl.innerHTML = '';
    }

    if (isOrganizer) {
      pokerOrganizerNextEl.classList.remove('hidden');
      pokerWaitingNextEl.classList.add('hidden');
    } else {
      pokerOrganizerNextEl.classList.add('hidden');
      pokerWaitingNextEl.classList.remove('hidden');
    }
  } else {
    pokerHandOverEl.classList.add('hidden');
  }
}

// ============================================================
// SOLITAIRE RENDERING
// ============================================================

function _solCardHtml(card, fromData, isSelected, extraStyle) {
  if (card.hidden) {
    return `<div class="playing-card card-back"${extraStyle ? ` style="${extraStyle}"` : ''}></div>`;
  }
  const colorClass = card.isRed ? 'red' : 'black';
  const sel = isSelected ? ' sol-selected' : '';
  const fromAttr = fromData ? ` data-sol-from='${JSON.stringify(fromData)}'` : '';
  return `<div class="playing-card ${colorClass} sol-card${sel}"${fromAttr}${extraStyle ? ` style="${extraStyle}"` : ''}>
    <div class="card-top">${card.rank}<br>${card.suit}</div>
    <div class="card-center">${card.suit}</div>
    <div class="card-bottom">${card.rank}<br>${card.suit}</div>
  </div>`;
}

function renderSolitaire(gs) {
  solMessageEl.textContent = gs.message || '';
  solMovesEl.textContent = `Moves: ${gs.moves}`;

  // Stock pile
  solStockEl.innerHTML = '';
  if (gs.stockCount > 0) {
    solStockEl.innerHTML = `<div class="playing-card card-back sol-card" data-sol-action="draw_stock" title="Draw card"></div>`;
  } else {
    solStockEl.innerHTML = `<div class="sol-pile-empty sol-card" data-sol-action="draw_stock" title="Click to flip waste to stock">↺</div>`;
  }

  // Waste pile (show top card)
  solWasteEl.innerHTML = '';
  if (gs.waste.length > 0) {
    const topWaste = gs.waste[gs.waste.length - 1];
    const isSelected = solSelected && solSelected.type === 'waste';
    const fromData = { type: 'waste' };
    solWasteEl.innerHTML = _solCardHtml(topWaste, fromData, isSelected, null);
  } else {
    solWasteEl.innerHTML = '<div class="sol-pile-empty"></div>';
  }

  // Foundations
  const SUITS = ['♠', '♥', '♦', '♣'];
  const foundSlots = solFoundationsEl.querySelectorAll('.sol-foundation-slot');
  foundSlots.forEach((slot, i) => {
    const suit = SUITS[i];
    const pile = gs.foundations[suit];
    slot.innerHTML = '';
    if (pile && pile.length > 0) {
      const topCard = pile[pile.length - 1];
      const colorClass = topCard.isRed ? 'red' : 'black';
      slot.innerHTML = `<div class="playing-card ${colorClass}" style="position:absolute;top:0;left:0">
        <div class="card-top">${topCard.rank}<br>${topCard.suit}</div>
        <div class="card-center">${topCard.suit}</div>
        <div class="card-bottom">${topCard.rank}<br>${topCard.suit}</div>
      </div>`;
    }
  });

  // Tableau
  solTableauEl.innerHTML = '';
  gs.tableau.forEach((col, colIdx) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'sol-col';
    colDiv.dataset.solToCol = colIdx;

    if (col.length === 0) {
      colDiv.innerHTML = `<div class="sol-pile-empty sol-col-empty" data-sol-to-col="${colIdx}"></div>`;
    } else {
      col.forEach((card, cardIdx) => {
        const isFirst = cardIdx === 0;
        const marginStyle = isFirst ? '' : `margin-top:${card.hidden ? '-76px' : '-62px'};`;
        const styleStr = `${marginStyle}z-index:${cardIdx + 1};position:relative;`;
        const isSelected = solSelected &&
          solSelected.type === 'tableau' &&
          solSelected.col === colIdx &&
          cardIdx >= solSelected.cardIndex;
        const fromData = card.hidden ? null : { type: 'tableau', col: colIdx, cardIndex: cardIdx };
        colDiv.innerHTML += _solCardHtml(card, fromData, isSelected, styleStr);
      });
    }
    solTableauEl.appendChild(colDiv);
  });

  // Show won overlay
  if (gs.phase === 'won') {
    solMessageEl.classList.add('sol-won');
  } else {
    solMessageEl.classList.remove('sol-won');
  }
}

// ============================================================
// FREECELL RENDERING
// ============================================================

function _fcCardHtml(card, fromData, isSelected, extraStyle) {
  if (!card) return '';
  const colorClass = card.isRed ? 'red' : 'black';
  const sel = isSelected ? ' fc-selected' : '';
  const fromAttr = fromData ? ` data-fc-from='${JSON.stringify(fromData)}'` : '';
  return `<div class="playing-card ${colorClass} fc-card${sel}"${fromAttr}${extraStyle ? ` style="${extraStyle}"` : ''}>
    <div class="card-top">${card.rank}<br>${card.suit}</div>
    <div class="card-center">${card.suit}</div>
    <div class="card-bottom">${card.rank}<br>${card.suit}</div>
  </div>`;
}

function renderFreeCell(gs) {
  fcMessageEl.textContent = gs.message || '';
  fcMovesEl.textContent = `Moves: ${gs.moves}`;

  // Free cells
  const cellSlots = fcFreeCellsEl.querySelectorAll('.fc-cell-slot');
  cellSlots.forEach((slot, i) => {
    const card = gs.freeCells[i];
    slot.innerHTML = '';
    if (card) {
      const isSelected = fcSelected && fcSelected.type === 'freecell' && fcSelected.cell === i;
      const fromData = { type: 'freecell', cell: i };
      slot.innerHTML = _fcCardHtml(card, fromData, isSelected, 'position:absolute;top:0;left:0');
    }
  });

  // Home cells
  const homeSlots = fcHomeEl.querySelectorAll('.fc-home-slot');
  const SUITS = ['♠', '♥', '♦', '♣'];
  homeSlots.forEach((slot, i) => {
    const suit = SUITS[i];
    const pile = gs.home[suit];
    slot.innerHTML = '';
    if (pile && pile.length > 0) {
      const topCard = pile[pile.length - 1];
      const colorClass = topCard.isRed ? 'red' : 'black';
      slot.innerHTML = `<div class="playing-card ${colorClass}" style="position:absolute;top:0;left:0">
        <div class="card-top">${topCard.rank}<br>${topCard.suit}</div>
        <div class="card-center">${topCard.suit}</div>
        <div class="card-bottom">${topCard.rank}<br>${topCard.suit}</div>
      </div>`;
    } else {
      // Show suit label hint
      slot.dataset.suit = suit;
    }
  });

  // Cascades
  fcCascadesEl.innerHTML = '';
  gs.cascades.forEach((col, colIdx) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'fc-cascade';
    colDiv.dataset.fcToCol = colIdx;

    if (col.length === 0) {
      colDiv.innerHTML = `<div class="fc-pile-empty" data-fc-to-col="${colIdx}"></div>`;
    } else {
      col.forEach((card, cardIdx) => {
        const isFirst = cardIdx === 0;
        const marginStyle = isFirst ? '' : 'margin-top:-62px;';
        const styleStr = `${marginStyle}z-index:${cardIdx + 1};position:relative;`;
        const isSelected = fcSelected &&
          fcSelected.type === 'cascade' &&
          fcSelected.col === colIdx &&
          cardIdx >= fcSelected.cardIndex;
        const fromData = { type: 'cascade', col: colIdx, cardIndex: cardIdx };
        colDiv.innerHTML += _fcCardHtml(card, fromData, isSelected, styleStr);
      });
    }
    fcCascadesEl.appendChild(colDiv);
  });

  if (gs.phase === 'won') {
    fcMessageEl.classList.add('fc-won');
  } else {
    fcMessageEl.classList.remove('fc-won');
  }
}

// ============================================================
// MAIN RENDER
// ============================================================
function render(state) {
  myId = state.myId;
  isOrganizer = state.isOrganizer;

  roomIdEl.textContent = state.roomId || '';
  playerBadgeEl.textContent = state.players.find(p => p.id === myId)?.name || '';

  if (state.phase === 'lobby') {
    showView('lobby');
    renderLobby(state);
  } else if (state.phase === 'playing' && state.gameState) {
    const gs = state.gameState;
    currentGame = gs.game;

    if (gs.game === 'blackjack') {
      showView('blackjack');
      renderBlackjack(gs);
    } else if (gs.game === 'poker') {
      showView('poker');
      renderPoker(gs);
    } else if (gs.game === 'solitaire') {
      showView('solitaire');
      renderSolitaire(gs);
    } else if (gs.game === 'freecell') {
      showView('freecell');
      renderFreeCell(gs);
    } else if (gs.game === 'hearts' || gs.game === 'spades') {
      showView('tricks');
      renderTricks(gs);
    } else if (gs.game === 'crazyeights') {
      showView('crazyeights');
      renderCrazyEights(gs);
    }
  }
}

// ============================================================
// EVENT LISTENERS — LOBBY
// ============================================================
gameOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    if (!isOrganizer) return;
    socket.emit('select_game', { gameType: opt.dataset.game });
  });
});

btnAddBot.addEventListener('click', () => {
  socket.emit('add_computer');
});

btnStart.addEventListener('click', () => {
  socket.emit('start_game');
});

// ============================================================
// EVENT LISTENERS — BLACKJACK
// ============================================================
btnBjBet.addEventListener('click', () => {
  const amount = parseInt(bjBetAmountEl.value) || 50;
  socket.emit('game_action', { action: 'bet', data: { amount } });
});

btnBjHit.addEventListener('click', () => {
  socket.emit('game_action', { action: 'hit', data: {} });
});

btnBjStand.addEventListener('click', () => {
  socket.emit('game_action', { action: 'stand', data: {} });
});

btnBjDouble.addEventListener('click', () => {
  socket.emit('game_action', { action: 'double', data: {} });
});

btnBjNext.addEventListener('click', () => {
  socket.emit('next_round');
});

btnBjLobby.addEventListener('click', () => {
  socket.emit('return_to_lobby');
});

// ============================================================
// EVENT LISTENERS — POKER
// ============================================================
btnPokerFold.addEventListener('click', () => {
  socket.emit('game_action', { action: 'fold', data: {} });
});

btnPokerCheckCall.addEventListener('click', () => {
  const toCallAction = myActions.find(a => a.startsWith('call '));
  if (toCallAction) {
    socket.emit('game_action', { action: 'call', data: {} });
  } else {
    socket.emit('game_action', { action: 'check', data: {} });
  }
});

btnPokerRaise.addEventListener('click', () => {
  const amount = parseInt(pokerRaiseAmountEl.value);
  socket.emit('game_action', { action: 'raise', data: { amount } });
});

btnPokerAllin.addEventListener('click', () => {
  socket.emit('game_action', { action: 'allin', data: {} });
});

btnPokerNext.addEventListener('click', () => {
  socket.emit('next_round');
});

btnPokerLobby.addEventListener('click', () => {
  socket.emit('return_to_lobby');
});

// ============================================================
// EVENT LISTENERS — SOLITAIRE
// ============================================================

// Solitaire click handler (event delegation on view)
viewSolitaire.addEventListener('click', (e) => {
  const el = e.target.closest('[data-sol-action], [data-sol-from], [data-sol-to-col], .sol-foundation-slot, .sol-col-empty');
  if (!el) {
    solSelected = null;
    return;
  }

  // Draw from stock
  if (el.dataset.solAction === 'draw_stock') {
    solSelected = null;
    socket.emit('game_action', { action: 'draw_stock', data: {} });
    return;
  }

  // Click on a card (potential source)
  if (el.dataset.solFrom) {
    const from = JSON.parse(el.dataset.solFrom);

    if (solSelected) {
      // Something already selected — try to move selected to this card's column
      if (from.type === 'tableau') {
        socket.emit('game_action', {
          action: 'move_card',
          data: { from: solSelected, to: { type: 'tableau', col: from.col } }
        });
        solSelected = null;
      } else if (from.type === 'waste' && solSelected.type !== 'waste') {
        // Deselect if clicking waste while something else selected
        solSelected = null;
      } else {
        // Click same card to deselect, or select new card
        solSelected = (solSelected.type === from.type &&
          solSelected.col === from.col &&
          solSelected.cardIndex === from.cardIndex) ? null : from;
      }
    } else {
      solSelected = from;
    }

    // Re-render selection highlight without server round-trip
    _updateSolSelection();
    return;
  }

  // Click on foundation slot
  if (el.classList.contains('sol-foundation-slot') || el.closest('.sol-foundation-slot')) {
    const slot = el.classList.contains('sol-foundation-slot') ? el : el.closest('.sol-foundation-slot');
    if (solSelected) {
      socket.emit('game_action', {
        action: 'move_card',
        data: { from: solSelected, to: { type: 'foundation' } }
      });
      solSelected = null;
    }
    return;
  }

  // Click on empty tableau column
  if (el.dataset.solToCol !== undefined || el.classList.contains('sol-col-empty')) {
    const colIdx = parseInt(el.dataset.solToCol !== undefined ? el.dataset.solToCol : el.closest('.sol-col').dataset.solToCol);
    if (solSelected && !isNaN(colIdx)) {
      socket.emit('game_action', {
        action: 'move_card',
        data: { from: solSelected, to: { type: 'tableau', col: colIdx } }
      });
      solSelected = null;
    }
    return;
  }
});

// Double-click on solitaire card → auto-move to foundation
viewSolitaire.addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-sol-from]');
  if (!el) return;
  const from = JSON.parse(el.dataset.solFrom);
  solSelected = null;
  socket.emit('game_action', { action: 'auto_move', data: { from } });
});

function _updateSolSelection() {
  // Update highlight classes without full re-render
  document.querySelectorAll('.sol-card.sol-selected').forEach(c => c.classList.remove('sol-selected'));
  if (!solSelected) return;

  if (solSelected.type === 'waste') {
    const wasteCard = solWasteEl.querySelector('.sol-card');
    if (wasteCard) wasteCard.classList.add('sol-selected');
  } else if (solSelected.type === 'tableau') {
    const col = solTableauEl.querySelectorAll('.sol-col')[solSelected.col];
    if (col) {
      const cards = col.querySelectorAll('[data-sol-from]');
      cards.forEach(card => {
        const from = JSON.parse(card.dataset.solFrom);
        if (from.cardIndex >= solSelected.cardIndex) {
          card.classList.add('sol-selected');
        }
      });
    }
  }
}

btnSolNew.addEventListener('click', () => {
  solSelected = null;
  socket.emit('next_round');
});

btnSolLobby.addEventListener('click', () => {
  solSelected = null;
  socket.emit('return_to_lobby');
});

// ============================================================
// EVENT LISTENERS — FREECELL
// ============================================================

viewFreeCell.addEventListener('click', (e) => {
  const el = e.target.closest('[data-fc-from], .fc-home-slot, .fc-cell-slot, .fc-pile-empty, [data-fc-to-col]');
  if (!el) {
    fcSelected = null;
    return;
  }

  // Click on a card (source)
  if (el.dataset.fcFrom) {
    const from = JSON.parse(el.dataset.fcFrom);

    if (fcSelected) {
      // Move selected to this destination
      let to = null;
      if (from.type === 'cascade') {
        to = { type: 'cascade', col: from.col };
      } else if (from.type === 'freecell') {
        to = { type: 'freecell', cell: from.cell };
      }

      if (to) {
        // Check if clicking same card → deselect
        const isSame = fcSelected.type === from.type &&
          fcSelected.col === from.col &&
          fcSelected.cell === from.cell &&
          fcSelected.cardIndex === from.cardIndex;
        if (isSame) {
          fcSelected = null;
          _updateFcSelection();
          return;
        }
        socket.emit('game_action', { action: 'move_card', data: { from: fcSelected, to } });
        fcSelected = null;
      } else {
        fcSelected = from;
      }
    } else {
      fcSelected = from;
    }

    _updateFcSelection();
    return;
  }

  // Click on free cell slot (to move there)
  if (el.classList.contains('fc-cell-slot')) {
    const cellIdx = parseInt(el.dataset.cell);
    if (fcSelected && !isNaN(cellIdx)) {
      socket.emit('game_action', {
        action: 'move_card',
        data: { from: fcSelected, to: { type: 'freecell', cell: cellIdx } }
      });
      fcSelected = null;
    } else if (!fcSelected && el.querySelector('[data-fc-from]')) {
      // The card click will handle selection via data-fc-from
    }
    return;
  }

  // Click on home cell slot
  if (el.classList.contains('fc-home-slot') || el.closest('.fc-home-slot')) {
    if (fcSelected) {
      socket.emit('game_action', {
        action: 'move_card',
        data: { from: fcSelected, to: { type: 'home' } }
      });
      fcSelected = null;
    }
    return;
  }

  // Click on empty cascade column
  if (el.classList.contains('fc-pile-empty') || el.dataset.fcToCol !== undefined) {
    const colIdx = parseInt(el.dataset.fcToCol !== undefined ? el.dataset.fcToCol : el.closest('.fc-cascade').dataset.fcToCol);
    if (fcSelected && !isNaN(colIdx)) {
      socket.emit('game_action', {
        action: 'move_card',
        data: { from: fcSelected, to: { type: 'cascade', col: colIdx } }
      });
      fcSelected = null;
    }
    return;
  }
});

// Double-click on FreeCell card → auto-move to home
viewFreeCell.addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-fc-from]');
  if (!el) return;
  const from = JSON.parse(el.dataset.fcFrom);
  // Only top card of cascade or free cell card
  if (from.type === 'cascade') {
    fcSelected = null;
    socket.emit('game_action', {
      action: 'move_card',
      data: { from, to: { type: 'home' } }
    });
  } else if (from.type === 'freecell') {
    fcSelected = null;
    socket.emit('game_action', {
      action: 'move_card',
      data: { from, to: { type: 'home' } }
    });
  }
});

function _updateFcSelection() {
  document.querySelectorAll('.fc-card.fc-selected').forEach(c => c.classList.remove('fc-selected'));
  if (!fcSelected) return;

  if (fcSelected.type === 'cascade') {
    const col = fcCascadesEl.querySelectorAll('.fc-cascade')[fcSelected.col];
    if (col) {
      col.querySelectorAll('[data-fc-from]').forEach(card => {
        const from = JSON.parse(card.dataset.fcFrom);
        if (from.cardIndex >= fcSelected.cardIndex) {
          card.classList.add('fc-selected');
        }
      });
    }
  } else if (fcSelected.type === 'freecell') {
    const slot = fcFreeCellsEl.querySelectorAll('.fc-cell-slot')[fcSelected.cell];
    if (slot) {
      const card = slot.querySelector('[data-fc-from]');
      if (card) card.classList.add('fc-selected');
    }
  }
}

btnFcNew.addEventListener('click', () => {
  fcSelected = null;
  socket.emit('next_round');
});

btnFcLobby.addEventListener('click', () => {
  fcSelected = null;
  socket.emit('return_to_lobby');
});

// ============================================================
// HEARTS / SPADES RENDERING (shared trick-taking table)
// ============================================================
const viewTricks = document.getElementById('view-tricks');
const ttMessageEl = document.getElementById('tt-message');
const ttScoreboardEl = document.getElementById('tt-scoreboard');
const ttCenterInfoEl = document.getElementById('tt-center-info');
const ttActionsEl = document.getElementById('tt-actions');
const ttPassControlsEl = document.getElementById('tt-pass-controls');
const btnTtPass = document.getElementById('btn-tt-pass');
const ttBidControlsEl = document.getElementById('tt-bid-controls');
const ttHandEl = document.getElementById('tt-hand');
const ttHandOverEl = document.getElementById('tt-hand-over');
const ttResultsEl = document.getElementById('tt-results');
const ttOrganizerNextEl = document.getElementById('tt-organizer-next');
const ttWaitingNextEl = document.getElementById('tt-waiting-next');
const btnTtNext = document.getElementById('btn-tt-next');
const btnTtLobby = document.getElementById('btn-tt-lobby');

let ttPassSelection = []; // [{ suit, rank }] chosen for the Hearts pass
let ttLastState = null;

const cardKey = c => `${c.rank}${c.suit}`;

function _handCardHtml(card, extraClass) {
  const colorClass = card.isRed ? 'red' : 'black';
  return `<div class="playing-card ${colorClass} ${extraClass}" data-card="${esc(cardKey(card))}">
    <div class="card-top">${card.rank}<br>${card.suit}</div>
    <div class="card-center">${card.suit}</div>
    <div class="card-bottom">${card.rank}<br>${card.suit}</div>
  </div>`;
}

function renderTricks(gs) {
  ttLastState = gs;
  const isHearts = gs.game === 'hearts';
  const myActions = gs.myActions || [];
  ttMessageEl.textContent = gs.message || '';

  // Scoreboard
  if (isHearts) {
    ttScoreboardEl.innerHTML = gs.seats.map((s, i) =>
      `<div class="tt-score-item"><span>${esc(s.name)}</span><strong>${gs.seatScores[i].score}</strong></div>`
    ).join('') + `<div class="tt-score-note">Hand ${gs.handNumber} · first to 100 loses</div>`;
  } else {
    ttScoreboardEl.innerHTML = gs.teams.map(t =>
      `<div class="tt-score-item"><span>${esc(t.name)}</span><strong>${t.score}</strong>
        <em>bid ${t.bid} · won ${t.tricks} · bags ${t.bags}</em></div>`
    ).join('') + `<div class="tt-score-note">Hand ${gs.handNumber} · first to 500 wins</div>`;
  }

  // Seats, positioned relative to me (0 = me at bottom, 1 = left, 2 = across, 3 = right)
  const rel = seat => (seat - gs.mySeat + 4) % 4;
  gs.seats.forEach((s, seat) => {
    const el = document.getElementById(`tt-seat-${rel(seat)}`);
    let detail = `${s.cardCount} cards · ${s.tricks} tricks`;
    if (isHearts) {
      detail += ` · ${gs.seatScores[seat].handPoints} pts`;
    } else {
      const bid = gs.bids[seat];
      detail += ` · bid ${bid === null ? '—' : bid === 0 ? 'Nil' : bid}`;
    }
    let badges = '';
    if (!isHearts && seat === gs.dealerSeat) badges += '<span class="badge badge-dealer">D</span>';
    if (!isHearts && seat % 2 === gs.mySeat % 2 && seat !== gs.mySeat) badges += '<span class="badge badge-bb">Partner</span>';
    if (isHearts && gs.phase === 'passing' && gs.passedSeats[seat]) badges += '<span class="badge badge-bb">Passed</span>';
    el.className = `tt-seat tt-seat-${['bottom', 'left', 'top', 'right'][rel(seat)]}` +
      (seat === gs.turnSeat ? ' is-current' : '') + (s.isMe ? ' is-me' : '');
    el.innerHTML = `<div class="tt-seat-name">${esc(s.name)}${s.isMe ? ' (You)' : ''}${s.isComputer ? ' 🤖' : ''} ${badges}</div>
      <div class="tt-seat-detail">${detail}</div>`;
  });

  // Trick in the centre
  document.querySelectorAll('#tt-center .tt-slot').forEach(slot => { slot.innerHTML = ''; });
  for (const t of gs.trick) {
    const slot = document.querySelector(`#tt-center .tt-slot[data-rel="${rel(t.seat)}"]`);
    slot.innerHTML = renderCard(t.card);
  }
  let info = '';
  if (gs.phase === 'passing') info = gs.iHavePassed ? 'Waiting for others to pass…' : `Pass 3 cards ${gs.passDir}`;
  else if (gs.phase === 'passed') info = `Received: ${gs.received.map(c => c.rank + c.suit).join(' ')}`;
  else if (gs.phase === 'bidding') info = 'Bidding';
  else if (isHearts && gs.heartsBroken && gs.trick.length === 0) info = 'Hearts broken ♥';
  else if (!isHearts && gs.spadesBroken && gs.trick.length === 0) info = 'Spades broken ♠';
  ttCenterInfoEl.textContent = info;

  // My hand
  const canPass = myActions.includes('pass');
  const canPlay = myActions.includes('play');
  if (!canPass) ttPassSelection = [];
  ttPassSelection = ttPassSelection.filter(sel => gs.myHand.some(c => cardKey(c) === cardKey(sel)));
  const receivedKeys = (gs.phase === 'passed' || (gs.phase === 'playing' && gs.trick.length === 0 && gs.lastTrick === null))
    ? (gs.received || []).map(cardKey) : [];

  ttHandEl.innerHTML = gs.myHand.map(c => {
    let cls = 'hand-card';
    if (canPlay) cls += c.playable ? ' is-playable' : ' is-disabled';
    if (canPass) {
      cls += ' is-playable';
      if (ttPassSelection.some(sel => cardKey(sel) === cardKey(c))) cls += ' is-raised';
    }
    if (receivedKeys.includes(cardKey(c))) cls += ' is-received';
    return _handCardHtml(c, cls);
  }).join('');

  // Actions
  ttPassControlsEl.classList.toggle('hidden', !canPass);
  btnTtPass.disabled = ttPassSelection.length !== 3;
  btnTtPass.textContent = `Pass ${ttPassSelection.length}/3 Cards ${gs.passDir || ''}`;

  const canBid = myActions.includes('bid');
  ttBidControlsEl.classList.toggle('hidden', !canBid);
  if (canBid && !ttBidControlsEl.childElementCount) {
    let html = '<span>Your bid:</span>';
    for (let b = 0; b <= 13; b++) {
      html += `<button class="btn btn-secondary btn-small tt-bid-btn" data-bid="${b}">${b === 0 ? 'Nil' : b}</button>`;
    }
    ttBidControlsEl.innerHTML = html;
  }
  ttActionsEl.classList.toggle('hidden', !canPass && !canBid);

  // Hand / game over
  const over = gs.phase === 'hand_over' || gs.phase === 'game_over';
  ttHandOverEl.classList.toggle('hidden', !over);
  if (over && gs.handResults) {
    let html = '<table class="tt-results-table"><tr>';
    if (isHearts) {
      html += '<th>Player</th><th>This hand</th><th>Total</th></tr>';
      for (const r of gs.handResults) html += `<tr><td>${esc(r.name)}</td><td>+${r.points}</td><td>${r.total}</td></tr>`;
    } else {
      html += '<th>Team</th><th>Bid</th><th>Won</th><th>Points</th><th>Total</th></tr>';
      for (const r of gs.handResults) {
        html += `<tr><td>${esc(r.name)}${r.notes.length ? `<br><em>${esc(r.notes.join(', '))}</em>` : ''}</td>
          <td>${r.bid}</td><td>${r.tricks}</td><td>${r.points >= 0 ? '+' : ''}${r.points}</td><td>${r.total}</td></tr>`;
      }
    }
    html += '</table>';
    ttResultsEl.innerHTML = html;
  }
  btnTtNext.textContent = gs.phase === 'game_over' ? 'New Game' : 'Next Hand';
  ttOrganizerNextEl.classList.toggle('hidden', !over || !isOrganizer);
  ttWaitingNextEl.classList.toggle('hidden', !over || isOrganizer);
}

ttHandEl.addEventListener('click', (e) => {
  const cardEl = e.target.closest('.playing-card');
  if (!cardEl || !ttLastState) return;
  const card = ttLastState.myHand.find(c => cardKey(c) === cardEl.dataset.card);
  if (!card) return;
  const actions = ttLastState.myActions || [];

  if (actions.includes('pass')) {
    const i = ttPassSelection.findIndex(sel => cardKey(sel) === cardKey(card));
    if (i !== -1) ttPassSelection.splice(i, 1);
    else if (ttPassSelection.length < 3) ttPassSelection.push({ suit: card.suit, rank: card.rank });
    renderTricks(ttLastState);
  } else if (actions.includes('play') && card.playable) {
    socket.emit('game_action', { action: 'play', data: { card: { suit: card.suit, rank: card.rank } } });
  }
});

btnTtPass.addEventListener('click', () => {
  if (ttPassSelection.length !== 3) return;
  socket.emit('game_action', { action: 'pass', data: { cards: ttPassSelection } });
  ttPassSelection = [];
});

ttBidControlsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tt-bid-btn');
  if (!btn) return;
  socket.emit('game_action', { action: 'bid', data: { bid: Number(btn.dataset.bid) } });
});

btnTtNext.addEventListener('click', () => socket.emit('next_round'));
btnTtLobby.addEventListener('click', () => socket.emit('return_to_lobby'));

// ============================================================
// CRAZY EIGHTS RENDERING
// ============================================================
const viewCrazyEights = document.getElementById('view-crazyeights');
const c8MessageEl = document.getElementById('c8-message');
const c8PlayersEl = document.getElementById('c8-players');
const c8DrawEl = document.getElementById('c8-draw');
const c8DrawCountEl = document.getElementById('c8-draw-count');
const c8DiscardEl = document.getElementById('c8-discard');
const c8SuitEl = document.getElementById('c8-suit');
const c8ActionsEl = document.getElementById('c8-actions');
const btnC8Draw = document.getElementById('btn-c8-draw');
const btnC8Pass = document.getElementById('btn-c8-pass');
const c8SuitPickerEl = document.getElementById('c8-suit-picker');
const btnC8Cancel = document.getElementById('btn-c8-cancel');
const c8HandEl = document.getElementById('c8-hand');
const c8RoundOverEl = document.getElementById('c8-round-over');
const c8ResultsEl = document.getElementById('c8-results');
const c8OrganizerNextEl = document.getElementById('c8-organizer-next');
const c8WaitingNextEl = document.getElementById('c8-waiting-next');
const btnC8Next = document.getElementById('btn-c8-next');
const btnC8Lobby = document.getElementById('btn-c8-lobby');

let c8PendingEight = null; // the 8 waiting for a suit choice
let c8LastState = null;

function renderCrazyEights(gs) {
  c8LastState = gs;
  const myActions = gs.myActions || [];
  const myTurn = myActions.includes('play');
  if (!myTurn) c8PendingEight = null;

  c8MessageEl.textContent = gs.message || '';

  c8PlayersEl.innerHTML = gs.players.map(p => `
    <div class="c8-player${p.isCurrent ? ' is-current' : ''}${p.isMe ? ' is-me' : ''}">
      <div class="tt-seat-name">${esc(p.name)}${p.isMe ? ' (You)' : ''}${p.isComputer ? ' 🤖' : ''}</div>
      <div class="tt-seat-detail">${p.cardCount} card${p.cardCount === 1 ? '' : 's'} · ${p.score} pts</div>
    </div>`).join('');

  c8DrawEl.innerHTML = gs.drawCount > 0
    ? `<div class="playing-card card-back${myActions.includes('draw') ? ' sol-card' : ''}" title="Draw a card"></div>`
    : '<div class="card-placeholder"></div>';
  c8DrawCountEl.textContent = `${gs.drawCount} left`;
  c8DiscardEl.innerHTML = gs.topCard ? renderCard(gs.topCard) : '';
  const red = gs.currentSuit === '♥' || gs.currentSuit === '♦';
  c8SuitEl.innerHTML = `Suit: <span class="${red ? 'red-icon' : ''}">${gs.currentSuit || ''}</span>`;

  c8HandEl.innerHTML = gs.myHand.map(c => {
    let cls = 'hand-card';
    if (myTurn) cls += c.playable ? ' is-playable' : ' is-disabled';
    if (c8PendingEight && cardKey(c8PendingEight) === cardKey(c)) cls += ' is-raised';
    return _handCardHtml(c, cls);
  }).join('');

  c8ActionsEl.classList.toggle('hidden', !myTurn || !!c8PendingEight);
  btnC8Draw.classList.toggle('hidden', !myActions.includes('draw'));
  btnC8Pass.classList.toggle('hidden', !myActions.includes('pass'));
  c8SuitPickerEl.classList.toggle('hidden', !c8PendingEight);

  const over = gs.phase === 'round_over';
  c8RoundOverEl.classList.toggle('hidden', !over);
  if (over && gs.roundResult) {
    const rr = gs.roundResult;
    let html = `<div class="showdown-won">${esc(rr.winner)} wins the round (+${rr.gained})</div>
      <table class="tt-results-table"><tr><th>Player</th><th>Cards left</th><th>Points given</th><th>Total</th></tr>`;
    rr.results.forEach((r, i) => {
      html += `<tr><td>${esc(r.name)}</td><td>${r.cardsLeft}</td><td>${r.points}</td><td>${gs.players[i].score}</td></tr>`;
    });
    c8ResultsEl.innerHTML = html + '</table>';
  }
  c8OrganizerNextEl.classList.toggle('hidden', !over || !isOrganizer);
  c8WaitingNextEl.classList.toggle('hidden', !over || isOrganizer);
}

c8HandEl.addEventListener('click', (e) => {
  const cardEl = e.target.closest('.playing-card');
  if (!cardEl || !c8LastState) return;
  const card = c8LastState.myHand.find(c => cardKey(c) === cardEl.dataset.card);
  if (!card || !card.playable) return;
  if (card.rank === '8') {
    c8PendingEight = { suit: card.suit, rank: card.rank };
    renderCrazyEights(c8LastState);
    return;
  }
  socket.emit('game_action', { action: 'play', data: { card: { suit: card.suit, rank: card.rank } } });
});

c8SuitPickerEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.c8-suit-btn');
  if (!btn || !c8PendingEight) return;
  socket.emit('game_action', { action: 'play', data: { card: c8PendingEight, suit: btn.dataset.suit } });
  c8PendingEight = null;
});

btnC8Cancel.addEventListener('click', () => {
  c8PendingEight = null;
  if (c8LastState) renderCrazyEights(c8LastState);
});

c8DrawEl.addEventListener('click', () => {
  if (c8LastState && (c8LastState.myActions || []).includes('draw')) {
    socket.emit('game_action', { action: 'draw', data: {} });
  }
});
btnC8Draw.addEventListener('click', () => socket.emit('game_action', { action: 'draw', data: {} }));
btnC8Pass.addEventListener('click', () => socket.emit('game_action', { action: 'pass', data: {} }));
btnC8Next.addEventListener('click', () => socket.emit('next_round'));
btnC8Lobby.addEventListener('click', () => socket.emit('return_to_lobby'));

// ============================================================
// SOCKET EVENTS
// ============================================================
socket.on('room_state', (state) => {
  // Clear single-player selection on server update
  if (state.gameState && state.gameState.game === 'solitaire') solSelected = null;
  if (state.gameState && state.gameState.game === 'freecell') fcSelected = null;
  render(state);
});

socket.on('error', ({ message }) => {
  showError(message);
});

socket.on('removed_from_room', () => {
  alert('You were removed from the room.');
  window.location.href = '/';
});

socket.on('disconnect', () => {
  showError('Disconnected from server. Please refresh.');
});

// ---- Helper ----
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ============================================================
// INIT — reconnect with initial state
// ============================================================
socket.on('connect', () => {
  if (initialState) {
    socket.emit('rejoin_room', { roomId: initialState.roomId, myId: initialState.myId });
  }
});

render(initialState);
