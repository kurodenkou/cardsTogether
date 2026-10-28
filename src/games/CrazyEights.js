'use strict';

const { Deck, SUITS } = require('../Deck');
const { sortHand, sameCard } = require('./TrickGame');

function cardScore(card) {
  if (card.rank === '8') return 50;
  if (['J', 'Q', 'K', '10'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 1;
  return parseInt(card.rank, 10);
}

class C8Player {
  constructor(player) {
    this.id = player.id;
    this.name = player.name;
    this.isComputer = player.isComputer;
    this.hand = [];
    this.score = 0;
  }
}

class CrazyEights {
  constructor(players, emitCallback) {
    this.players = players.map(p => new C8Player(p));
    this.emit = emitCallback;
    this.drawPile = [];
    this.discard = [];
    this.currentSuit = null;
    this.turnIdx = -1;
    this.dealerIdx = Math.floor(Math.random() * this.players.length);
    this.hasDrawn = false;
    this.phase = 'idle'; // playing, round_over
    this.round = 0;
    this.message = '';
    this.roundResult = null;
    this.consecutivePasses = 0;
    this._timer = null;
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _delay(fn, ms) {
    this._clearTimer();
    this._timer = setTimeout(fn, ms);
  }

  start() {
    this._newRound();
  }

  _newRound() {
    this.round++;
    this._clearTimer();
    const deck = new Deck(1);
    const handSize = this.players.length === 2 ? 7 : 5;
    for (const p of this.players) {
      p.hand = [];
      for (let i = 0; i < handSize; i++) p.hand.push(deck.deal());
      sortHand(p.hand);
    }
    this.drawPile = deck.cards.splice(0);
    // Don't start on an 8 — bury it and flip again
    let starter = this.drawPile.pop();
    while (starter.rank === '8') {
      this.drawPile.unshift(starter);
      starter = this.drawPile.pop();
    }
    this.discard = [starter];
    this.currentSuit = starter.suit;
    this.roundResult = null;
    this.consecutivePasses = 0;
    this.phase = 'playing';
    this.dealerIdx = (this.dealerIdx + 1) % this.players.length;
    const first = (this.dealerIdx + 1) % this.players.length;
    this.message = `Round ${this.round} — ${this.players[first].name} starts`;
    this._beginTurn(first);
  }

  _top() {
    return this.discard[this.discard.length - 1];
  }

  _canPlay(card) {
    const top = this._top();
    return card.rank === '8' || card.suit === this.currentSuit || card.rank === top.rank;
  }

  _canDraw() {
    return !this.hasDrawn && (this.drawPile.length > 0 || this.discard.length > 1);
  }

  _beginTurn(idx) {
    this.turnIdx = idx;
    this.hasDrawn = false;
    const p = this.players[idx];
    this.emit();
    if (p.isComputer) this._delay(() => this._botTurn(idx), 1000);
  }

  _nextTurn() {
    this._beginTurn((this.turnIdx + 1) % this.players.length);
  }

  handleAction(playerId, action, data) {
    if (this.phase !== 'playing') return;
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1 || idx !== this.turnIdx || this.players[idx].isComputer) return;

    if (action === 'play') this._play(idx, data.card, data.suit);
    else if (action === 'draw') this._draw(idx);
    else if (action === 'pass') this._pass(idx);
  }

  _play(idx, cardData, chosenSuit) {
    const p = this.players[idx];
    const handIdx = p.hand.findIndex(c => sameCard(c, cardData));
    if (handIdx === -1) return;
    const card = p.hand[handIdx];
    if (!this._canPlay(card)) return;
    if (card.rank === '8' && !SUITS.includes(chosenSuit)) return;

    p.hand.splice(handIdx, 1);
    this.discard.push(card);
    this.consecutivePasses = 0;
    this.currentSuit = card.rank === '8' ? chosenSuit : card.suit;
    this.message = card.rank === '8'
      ? `${p.name} plays a crazy 8 — suit is now ${chosenSuit}`
      : `${p.name} plays ${card.rank}${card.suit}`;

    if (p.hand.length === 0) {
      this._endRound(idx);
      return;
    }
    if (p.hand.length === 1) this.message += ' — last card!';
    this._nextTurn();
  }

  _draw(idx) {
    if (!this._canDraw()) return;
    if (this.drawPile.length === 0) {
      // Reshuffle everything under the top discard back into the draw pile
      const top = this.discard.pop();
      this.drawPile = this.discard;
      for (let i = this.drawPile.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.drawPile[i], this.drawPile[j]] = [this.drawPile[j], this.drawPile[i]];
      }
      this.discard = [top];
    }
    const p = this.players[idx];
    p.hand.push(this.drawPile.pop());
    sortHand(p.hand);
    this.hasDrawn = true;
    this.message = `${p.name} draws a card`;
    this.emit();
  }

  _pass(idx) {
    if (this._canDraw()) return; // must draw before passing
    this.message = `${this.players[idx].name} passes`;
    this.consecutivePasses++;
    if (this.consecutivePasses >= this.players.length) {
      // Nobody can play or draw — lowest hand wins the blocked round
      const handValue = p => p.hand.reduce((s, c) => s + cardScore(c), 0);
      let best = 0;
      this.players.forEach((p, i) => { if (handValue(p) < handValue(this.players[best])) best = i; });
      this._endRound(best, true);
      return;
    }
    this._nextTurn();
  }

  _endRound(winnerIdx, blocked = false) {
    const winner = this.players[winnerIdx];
    const results = this.players.map((p, i) => ({
      name: p.name,
      cardsLeft: p.hand.length,
      points: i === winnerIdx ? 0 : p.hand.reduce((s, c) => s + cardScore(c), 0)
    }));
    const gained = results.reduce((s, r) => s + r.points, 0);
    winner.score += gained;
    this.roundResult = { winner: winner.name, gained, results };
    this.phase = 'round_over';
    this.turnIdx = -1;
    this.message = blocked
      ? `Blocked! ${winner.name} has the lowest hand and scores ${gained} points`
      : `${winner.name} goes out and scores ${gained} points!`;
    this.emit();
  }

  nextRound() {
    if (this.phase !== 'round_over') return;
    this._newRound();
  }

  // ---- Bots ----
  _botTurn(idx) {
    if (this.phase !== 'playing' || this.turnIdx !== idx) return;
    const p = this.players[idx];
    const playable = p.hand.filter(c => this._canPlay(c));

    if (playable.length) {
      const suitCount = s => p.hand.filter(c => c.suit === s && c.rank !== '8').length;
      const normal = playable.filter(c => c.rank !== '8');
      if (normal.length) {
        // Play into the suit we hold the most of, highest card first to shed points
        normal.sort((a, b) => suitCount(b.suit) - suitCount(a.suit) || b.rankIndex - a.rankIndex);
        this._play(idx, normal[0]);
      } else {
        const bestSuit = SUITS.slice().sort((a, b) => suitCount(b) - suitCount(a))[0];
        this._play(idx, playable[0], bestSuit);
      }
      return;
    }

    if (this._canDraw()) {
      this._draw(idx);
      this._delay(() => this._botTurn(idx), 800);
      return;
    }
    this._pass(idx);
  }

  getStateFor(playerId) {
    const myIdx = this.players.findIndex(p => p.id === playerId);
    const me = this.players[myIdx];
    const myTurn = this.phase === 'playing' && myIdx === this.turnIdx;
    const myActions = [];
    if (myTurn) {
      myActions.push('play');
      if (this._canDraw()) myActions.push('draw');
      else myActions.push('pass');
    }
    const top = this._top();

    return {
      game: 'crazyeights',
      phase: this.phase,
      round: this.round,
      message: this.message,
      currentSuit: this.currentSuit,
      topCard: top ? top.toJSON() : null,
      drawCount: this.drawPile.length,
      currentPlayerIndex: this.turnIdx,
      players: this.players.map((p, i) => ({
        name: p.name,
        isComputer: p.isComputer,
        cardCount: p.hand.length,
        score: p.score,
        isCurrent: i === this.turnIdx,
        isMe: i === myIdx
      })),
      myHand: me ? me.hand.map(c => ({ ...c.toJSON(), playable: myTurn && this._canPlay(c) })) : [],
      roundResult: this.roundResult,
      myActions
    };
  }
}

module.exports = CrazyEights;
