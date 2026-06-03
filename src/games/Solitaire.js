'use strict';

const { Deck } = require('../Deck');

// Solitaire rank order: A=0, 2=1, ..., K=12
const SOL_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function solRankIndex(rank) { return SOL_RANKS.indexOf(rank); }

class Solitaire {
  constructor(players, onStateChange) {
    this.playerId = players[0].id;
    this.onStateChange = onStateChange;
    this.stock = [];
    this.waste = [];
    this.foundations = { '♠': [], '♥': [], '♦': [], '♣': [] };
    this.tableau = [[], [], [], [], [], [], []];
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
    this.stock = [];
    this.waste = [];
    this.foundations = { '♠': [], '♥': [], '♦': [], '♣': [] };
    this.tableau = [[], [], [], [], [], [], []];
    this.moves = 0;
    this.phase = 'playing';

    // Deal to tableau: column i gets i+1 cards; only the last card is face-up
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        this.tableau[col].push(deck.deal(row < col)); // hidden until last
      }
    }
    // Remaining 24 cards go face-down to stock
    while (deck.remaining > 0) {
      this.stock.push(deck.deal(true));
    }
    this.message = 'Draw from the stock pile. Build foundations Ace → King to win!';
  }

  handleAction(playerId, action, data) {
    if (action === 'new_game') {
      this._deal();
      this.onStateChange();
      return;
    }
    if (this.phase === 'won') return;
    if (playerId !== this.playerId) return;

    if (action === 'draw_stock') {
      this._drawStock();
    } else if (action === 'move_card') {
      this._moveCard(data);
    } else if (action === 'auto_move') {
      this._autoMoveToFoundation(data);
    }
  }

  _drawStock() {
    if (this.stock.length === 0) {
      if (this.waste.length === 0) return;
      // Flip waste back to stock face-down
      this.stock = this.waste.reverse().map(c => { c.hidden = true; return c; });
      this.waste = [];
    } else {
      const card = this.stock.pop();
      card.hidden = false;
      this.waste.push(card);
    }
    this.moves++;
    this.onStateChange();
  }

  _moveCard(data) {
    const { from, to } = data || {};
    if (!from || !to) return;

    // Collect cards to move
    let cards = [];
    if (from.type === 'waste') {
      if (this.waste.length === 0) return;
      cards = [this.waste[this.waste.length - 1]];
    } else if (from.type === 'tableau') {
      const col = this.tableau[from.col];
      if (col === undefined || from.cardIndex === undefined) return;
      if (from.cardIndex < 0 || from.cardIndex >= col.length) return;
      if (col[from.cardIndex].hidden) return;
      cards = col.slice(from.cardIndex);
    } else {
      return;
    }

    if (cards.length === 0) return;

    if (to.type === 'foundation') {
      if (cards.length !== 1) return;
      const card = cards[0];
      const pile = this.foundations[card.suit];
      if (!this._canMoveToFoundation(card, pile)) return;
      this._removeFrom(from, cards.length);
      pile.push(card);
    } else if (to.type === 'tableau') {
      if (to.col === undefined) return;
      const destCol = this.tableau[to.col];
      if (!this._canMoveToTableau(cards[0], destCol)) return;
      this._removeFrom(from, cards.length);
      for (const c of cards) destCol.push(c);
    } else {
      return;
    }

    // Flip newly exposed top of source column
    if (from.type === 'tableau') {
      const col = this.tableau[from.col];
      if (col.length > 0 && col[col.length - 1].hidden) {
        col[col.length - 1].hidden = false;
      }
    }

    this.moves++;
    if (this._checkWin()) {
      this.phase = 'won';
      this.message = 'Congratulations! You won Solitaire!';
    }
    this.onStateChange();
  }

  _autoMoveToFoundation(data) {
    const { from } = data || {};
    if (!from) return;

    let card = null;
    let removeDesc = from;

    if (from.type === 'waste') {
      if (this.waste.length === 0) return;
      card = this.waste[this.waste.length - 1];
    } else if (from.type === 'tableau') {
      const col = this.tableau[from.col];
      if (!col || col.length === 0) return;
      card = col[col.length - 1];
      if (card.hidden) return;
      removeDesc = { type: 'tableau', col: from.col, cardIndex: col.length - 1 };
    } else {
      return;
    }

    const pile = this.foundations[card.suit];
    if (!this._canMoveToFoundation(card, pile)) return;
    this._removeFrom(removeDesc, 1);
    pile.push(card);

    if (from.type === 'tableau') {
      const col = this.tableau[from.col];
      if (col.length > 0 && col[col.length - 1].hidden) {
        col[col.length - 1].hidden = false;
      }
    }

    this.moves++;
    if (this._checkWin()) {
      this.phase = 'won';
      this.message = 'Congratulations! You won Solitaire!';
    }
    this.onStateChange();
  }

  _canMoveToFoundation(card, pile) {
    if (pile.length === 0) return card.rank === 'A';
    return solRankIndex(card.rank) === solRankIndex(pile[pile.length - 1].rank) + 1;
  }

  _canMoveToTableau(card, col) {
    if (col.length === 0) return card.rank === 'K';
    const top = col[col.length - 1];
    if (top.hidden) return false;
    return solRankIndex(card.rank) === solRankIndex(top.rank) - 1 && card.isRed !== top.isRed;
  }

  _removeFrom(from, count) {
    if (from.type === 'waste') {
      this.waste.pop();
    } else if (from.type === 'tableau') {
      this.tableau[from.col].splice(from.cardIndex, count);
    }
  }

  _checkWin() {
    return ['♠', '♥', '♦', '♣'].every(s => this.foundations[s].length === 13);
  }

  getStateFor(playerId) {
    return {
      game: 'solitaire',
      phase: this.phase,
      stockCount: this.stock.length,
      waste: this.waste.slice(-3).map(c => c.toJSON()),
      foundations: {
        '♠': this.foundations['♠'].map(c => c.toJSON()),
        '♥': this.foundations['♥'].map(c => c.toJSON()),
        '♦': this.foundations['♦'].map(c => c.toJSON()),
        '♣': this.foundations['♣'].map(c => c.toJSON()),
      },
      tableau: this.tableau.map(col => col.map(c => c.toJSON())),
      moves: this.moves,
      message: this.message,
    };
  }
}

module.exports = Solitaire;
