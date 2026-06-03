'use strict';

const { Deck } = require('../Deck');

// FreeCell rank order: A=0, 2=1, ..., K=12
const FC_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function fcRankIndex(rank) { return FC_RANKS.indexOf(rank); }

class FreeCell {
  constructor(players, onStateChange) {
    this.playerId = players[0].id;
    this.onStateChange = onStateChange;
    this.cascades = [];
    this.freeCells = [null, null, null, null];
    this.home = { '♠': [], '♥': [], '♦': [], '♣': [] };
    this.moves = 0;
    this.phase = 'playing';
    this.message = '';
  }

  start() {
    this._deal();
    this.onStateChange();
  }

  nextRound() {
    this._deal();
    this.onStateChange();
  }

  _deal() {
    const deck = new Deck(1);
    this.cascades = Array.from({ length: 8 }, () => []);
    this.freeCells = [null, null, null, null];
    this.home = { '♠': [], '♥': [], '♦': [], '♣': [] };
    this.moves = 0;
    this.phase = 'playing';

    // Deal 52 cards across 8 columns round-robin (all face-up)
    // Columns 0-3 get 7 cards, columns 4-7 get 6 cards
    let i = 0;
    while (deck.remaining > 0) {
      this.cascades[i % 8].push(deck.deal(false));
      i++;
    }
    this.message = 'Move all cards to the home cells (Ace → King per suit) to win!';
  }

  handleAction(playerId, action, data) {
    if (action === 'new_game') {
      this._deal();
      this.onStateChange();
      return;
    }
    if (this.phase === 'won') return;
    if (playerId !== this.playerId) return;

    if (action === 'move_card') {
      this._moveCard(data);
    }
  }

  _moveCard(data) {
    const { from, to } = data || {};
    if (!from || !to) return;

    // Collect cards to move
    let cards = [];
    if (from.type === 'cascade') {
      const col = this.cascades[from.col];
      if (!col || col.length === 0) return;
      const idx = (from.cardIndex !== undefined) ? from.cardIndex : col.length - 1;
      if (idx < 0 || idx >= col.length) return;
      cards = col.slice(idx);

      // Validate sequence: alternating colors, descending rank
      for (let i = 0; i < cards.length - 1; i++) {
        if (cards[i].isRed === cards[i + 1].isRed) return;
        if (fcRankIndex(cards[i].rank) !== fcRankIndex(cards[i + 1].rank) + 1) return;
      }
    } else if (from.type === 'freecell') {
      const card = this.freeCells[from.cell];
      if (!card) return;
      cards = [card];
    } else {
      return;
    }

    if (cards.length === 0) return;

    // Multi-card moves only valid to cascade
    if (cards.length > 1 && to.type !== 'cascade') return;

    // Check if we have enough empty slots to support multi-card move
    if (cards.length > 1) {
      const toEmptyCol = to.type === 'cascade' && this.cascades[to.col].length === 0;
      if (cards.length > this._maxMovable(toEmptyCol)) return;
    }

    // Execute move
    if (to.type === 'home') {
      if (cards.length !== 1) return;
      const pile = this.home[cards[0].suit];
      if (!this._canMoveToHome(cards[0], pile)) return;
      this._removeFromSource(from, cards.length);
      pile.push(cards[0]);
    } else if (to.type === 'freecell') {
      if (cards.length !== 1) return;
      if (to.cell === undefined || this.freeCells[to.cell] !== null) return;
      this._removeFromSource(from, cards.length);
      this.freeCells[to.cell] = cards[0];
    } else if (to.type === 'cascade') {
      if (to.col === undefined) return;
      const destCol = this.cascades[to.col];
      if (!this._canMoveToCascade(cards[0], destCol)) return;
      this._removeFromSource(from, cards.length);
      for (const c of cards) destCol.push(c);
    } else {
      return;
    }

    this.moves++;
    if (this._checkWin()) {
      this.phase = 'won';
      this.message = 'Congratulations! You won FreeCell!';
    }
    this.onStateChange();
  }

  // Max cards movable at once: (emptyFreeCells + 1) * 2^(emptyColumns)
  _maxMovable(toEmptyCol) {
    const f = this.freeCells.filter(c => c === null).length;
    let e = this.cascades.filter(col => col.length === 0).length;
    if (toEmptyCol && e > 0) e--; // target empty col doesn't count
    return (f + 1) * Math.pow(2, e);
  }

  _canMoveToHome(card, pile) {
    if (pile.length === 0) return card.rank === 'A';
    return fcRankIndex(card.rank) === fcRankIndex(pile[pile.length - 1].rank) + 1;
  }

  _canMoveToCascade(card, col) {
    if (col.length === 0) return true;
    const top = col[col.length - 1];
    return fcRankIndex(card.rank) === fcRankIndex(top.rank) - 1 && card.isRed !== top.isRed;
  }

  _removeFromSource(from, count) {
    if (from.type === 'cascade') {
      this.cascades[from.col].splice(-count, count);
    } else if (from.type === 'freecell') {
      this.freeCells[from.cell] = null;
    }
  }

  _checkWin() {
    return ['♠', '♥', '♦', '♣'].every(s => this.home[s].length === 13);
  }

  getStateFor(playerId) {
    return {
      game: 'freecell',
      phase: this.phase,
      cascades: this.cascades.map(col => col.map(c => c.toJSON())),
      freeCells: this.freeCells.map(c => (c ? c.toJSON() : null)),
      home: {
        '♠': this.home['♠'].map(c => c.toJSON()),
        '♥': this.home['♥'].map(c => c.toJSON()),
        '♦': this.home['♦'].map(c => c.toJSON()),
        '♣': this.home['♣'].map(c => c.toJSON()),
      },
      moves: this.moves,
      message: this.message,
    };
  }
}

module.exports = FreeCell;
