'use strict';

const { Deck } = require('../Deck');

const SMALL_BET = 50;

function calcHandValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.hidden) continue;
    if (card.rank === 'A') {
      aces++;
      value += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

class BJPlayer {
  constructor(player) {
    this.id = player.id;
    this.name = player.name;
    this.isComputer = player.isComputer;
    this.chips = player.chips;
    this.hand = [];
    this.bet = 0;
    this.status = 'idle'; // idle, betting, active, stand, bust, blackjack
    this.result = null;   // win, lose, push, blackjack
    this.doubled = false;
  }

  get handValue() {
    return calcHandValue(this.hand);
  }
}

class Blackjack {
  constructor(players, emitCallback) {
    this.players = players.map(p => new BJPlayer(p));
    this.emit = emitCallback;
    this.deck = null;
    this.dealer = { hand: [] };
    this.phase = 'idle';
    this.currentPlayerIndex = -1;
    this.round = 0;
    this.message = '';
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
    this.deck = new Deck(6);
    this.dealer.hand = [];
    this.phase = 'betting';
    this.message = 'Place your bets!';
    this.currentPlayerIndex = -1;

    for (const p of this.players) {
      p.hand = [];
      p.bet = 0;
      p.status = 'betting';
      p.result = null;
      p.doubled = false;
    }

    // Auto-bet for computers immediately
    for (const p of this.players) {
      if (p.isComputer) {
        const bet = Math.min(SMALL_BET, p.chips);
        p.bet = bet;
        p.chips -= bet;
        p.status = 'bet_placed';
      }
    }

    this.emit();
    this._checkAllBetsPlaced();
  }

  _checkAllBetsPlaced() {
    if (this.players.every(p => p.status === 'bet_placed')) {
      this._delay(() => this._dealInitialCards(), 600);
    }
  }

  _dealInitialCards() {
    this.phase = 'playing';

    // First card to each player
    for (const p of this.players) {
      p.hand.push(this.deck.deal());
      p.status = 'active';
    }
    // First card to dealer (visible)
    this.dealer.hand.push(this.deck.deal());

    // Second card to each player
    for (const p of this.players) {
      p.hand.push(this.deck.deal());
    }
    // Second card to dealer (hidden)
    this.dealer.hand.push(this.deck.deal(true));

    // Check for player blackjacks
    for (const p of this.players) {
      if (p.handValue === 21) {
        p.status = 'blackjack';
      }
    }

    this.message = 'Cards dealt!';
    this.currentPlayerIndex = -1;
    this.emit();
    this._delay(() => this._advanceToNextPlayer(), 300);
  }

  _advanceToNextPlayer() {
    let next = this.currentPlayerIndex + 1;
    while (next < this.players.length) {
      if (this.players[next].status === 'active') {
        this.currentPlayerIndex = next;
        const p = this.players[next];
        this.message = `${p.name}'s turn`;
        this.emit();
        if (p.isComputer) {
          this._delay(() => this._computerTurn(p), 1200);
        }
        return;
      }
      next++;
    }
    // No active players left — dealer's turn
    this._delay(() => this._dealerTurn(), 400);
  }

  _computerTurn(player) {
    if (this.phase !== 'playing') return;
    const val = player.handValue;
    const dealerUp = this.dealer.hand[0];
    const dealerVal = dealerUp
      ? (['J', 'Q', 'K'].includes(dealerUp.rank) ? 10 : dealerUp.rank === 'A' ? 11 : parseInt(dealerUp.rank))
      : 0;

    let action = 'stand';
    if (val < 12) {
      action = 'hit';
    } else if (val <= 16) {
      action = dealerVal >= 7 ? 'hit' : 'stand';
    }
    // Double on 10 or 11 vs weak dealer
    if (player.hand.length === 2 && player.chips >= player.bet) {
      if ((val === 10 && dealerVal <= 9) || (val === 11 && dealerVal <= 10)) {
        action = 'double';
      }
    }

    this._executeAction(player, action);
  }

  handleAction(playerId, action, data) {
    if (this.phase === 'betting' && action === 'bet') {
      const player = this.players.find(p => p.id === playerId);
      if (!player || player.isComputer || player.status !== 'betting') return;
      const amount = Math.max(10, Math.min(data.amount || SMALL_BET, player.chips));
      player.bet = amount;
      player.chips -= amount;
      player.status = 'bet_placed';
      this.emit();
      this._checkAllBetsPlaced();
      return;
    }

    if (this.phase !== 'playing') return;
    const current = this.players[this.currentPlayerIndex];
    if (!current || current.id !== playerId || current.isComputer) return;
    if (current.status !== 'active') return;

    this._executeAction(current, action);
  }

  _executeAction(player, action) {
    if (action === 'hit') {
      player.hand.push(this.deck.deal());
      const val = player.handValue;
      if (val > 21) {
        player.status = 'bust';
        this.message = `${player.name} busted with ${val}!`;
        this.emit();
        this._delay(() => this._advanceToNextPlayer(), 700);
      } else if (val === 21) {
        player.status = 'stand';
        this.message = `${player.name} hits 21!`;
        this.emit();
        this._delay(() => this._advanceToNextPlayer(), 700);
      } else {
        this.message = `${player.name} hits — ${val}`;
        this.emit();
        if (player.isComputer) {
          this._delay(() => this._computerTurn(player), 1100);
        }
      }
    } else if (action === 'stand') {
      player.status = 'stand';
      this.message = `${player.name} stands with ${player.handValue}`;
      this.emit();
      this._delay(() => this._advanceToNextPlayer(), 500);
    } else if (action === 'double') {
      if (player.hand.length !== 2 || player.chips < player.bet) return;
      player.chips -= player.bet;
      player.bet *= 2;
      player.doubled = true;
      player.hand.push(this.deck.deal());
      const val = player.handValue;
      player.status = val > 21 ? 'bust' : 'stand';
      this.message = `${player.name} doubles down — ${val}${val > 21 ? ' BUST!' : ''}`;
      this.emit();
      this._delay(() => this._advanceToNextPlayer(), 700);
    }
  }

  _dealerTurn() {
    this.phase = 'dealer_turn';
    // Reveal hidden card
    for (const c of this.dealer.hand) c.hidden = false;
    const val = calcHandValue(this.dealer.hand);
    this.message = `Dealer reveals: ${val}`;
    this.emit();

    // If all players busted, skip dealer play
    const anyStanding = this.players.some(p => p.status === 'stand' || p.status === 'blackjack');
    if (!anyStanding) {
      this._delay(() => this._resolveRound(), 600);
      return;
    }

    this._delay(() => this._dealerPlay(), 800);
  }

  _dealerPlay() {
    const val = calcHandValue(this.dealer.hand);
    if (val < 17) {
      this.dealer.hand.push(this.deck.deal());
      const newVal = calcHandValue(this.dealer.hand);
      this.message = `Dealer hits — ${newVal}`;
      this.emit();
      this._delay(() => this._dealerPlay(), 800);
    } else {
      this.message = `Dealer stands with ${val}`;
      this.emit();
      this._delay(() => this._resolveRound(), 700);
    }
  }

  _resolveRound() {
    this.phase = 'round_over';
    const dealerVal = calcHandValue(this.dealer.hand);
    const dealerBust = dealerVal > 21;
    const dealerBJ = dealerVal === 21 && this.dealer.hand.length === 2;

    for (const p of this.players) {
      if (p.status === 'bust') {
        p.result = 'lose';
        // chips already deducted at bet time
      } else if (p.status === 'blackjack') {
        if (dealerBJ) {
          p.result = 'push';
          p.chips += p.bet;
        } else {
          p.result = 'blackjack';
          p.chips += Math.floor(p.bet * 2.5); // 3:2 payout
        }
      } else {
        // stand or not-quite-blackjack
        const pVal = p.handValue;
        if (dealerBust || pVal > dealerVal) {
          p.result = 'win';
          p.chips += p.bet * 2;
        } else if (pVal === dealerVal) {
          p.result = 'push';
          p.chips += p.bet;
        } else {
          p.result = 'lose';
        }
      }
    }

    this.message = dealerBust
      ? `Dealer busted with ${dealerVal}!`
      : `Dealer finishes with ${dealerVal}`;
    this.emit();
  }

  nextRound() {
    if (this.phase !== 'round_over') return;
    // Boot players with no chips
    this.players = this.players.filter(p => p.chips > 0);
    const humans = this.players.filter(p => !p.isComputer);
    if (humans.length === 0) return;
    this._newRound();
  }

  getStateFor(playerId) {
    const cur = this.players[this.currentPlayerIndex];
    return {
      game: 'blackjack',
      phase: this.phase,
      round: this.round,
      message: this.message,
      currentPlayerId: cur ? cur.id : null,
      dealer: {
        hand: this.dealer.hand.map(c => c.toJSON()),
        value: (this.phase === 'dealer_turn' || this.phase === 'round_over')
          ? calcHandValue(this.dealer.hand)
          : calcHandValue(this.dealer.hand.filter(c => !c.hidden))
      },
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isComputer: p.isComputer,
        chips: p.chips,
        bet: p.bet,
        hand: p.hand.map(c => c.toJSON()),
        handValue: p.handValue,
        status: p.status,
        result: p.result,
        doubled: p.doubled,
        isCurrentPlayer: cur ? cur.id === p.id : false,
        isMe: p.id === playerId
      })),
      myActions: this._getActionsFor(playerId)
    };
  }

  _getActionsFor(playerId) {
    if (this.phase === 'betting') {
      const p = this.players.find(x => x.id === playerId);
      if (p && !p.isComputer && p.status === 'betting') return ['bet'];
      return [];
    }
    if (this.phase !== 'playing') return [];
    const cur = this.players[this.currentPlayerIndex];
    if (!cur || cur.id !== playerId || cur.isComputer) return [];
    if (cur.status !== 'active') return [];
    const actions = ['hit', 'stand'];
    if (cur.hand.length === 2 && cur.chips >= cur.bet) actions.push('double');
    return actions;
  }
}

module.exports = Blackjack;
