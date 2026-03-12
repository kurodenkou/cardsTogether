'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// Numeric rank value (2=0, A=12) — used for hand evaluation
const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));

class Card {
  constructor(suit, rank, hidden = false) {
    this.suit = suit;
    this.rank = rank;
    this.hidden = hidden;
  }

  get rankIndex() {
    return RANK_INDEX[this.rank];
  }

  get isRed() {
    return this.suit === '♥' || this.suit === '♦';
  }

  toJSON() {
    if (this.hidden) return { hidden: true };
    return { suit: this.suit, rank: this.rank, hidden: false, isRed: this.isRed };
  }
}

class Deck {
  constructor(numDecks = 1) {
    this._numDecks = numDecks;
    this._build();
    this.shuffle();
  }

  _build() {
    this.cards = [];
    for (let d = 0; d < this._numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push(new Card(suit, rank));
        }
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(hidden = false) {
    if (this.cards.length === 0) {
      this._build();
      this.shuffle();
    }
    const card = this.cards.pop();
    card.hidden = hidden;
    return card;
  }

  get remaining() {
    return this.cards.length;
  }
}

module.exports = { Card, Deck, SUITS, RANKS, RANK_INDEX };
