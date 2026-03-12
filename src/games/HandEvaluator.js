'use strict';

// Evaluates poker hands. Ranks: 0=High Card ... 8=Straight Flush
// RANK_INDEX: 2=0, 3=1, ..., K=11, A=12

const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

function getRankIdx(card) {
  return card.rankIndex; // already numeric 0-12
}

function getSuit(card) {
  return card.suit;
}

function evaluate5(cards) {
  // cards: array of exactly 5 Card objects
  const indices = cards.map(getRankIdx).sort((a, b) => b - a);
  const suits = cards.map(getSuit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (normal and ace-low A-2-3-4-5)
  const unique = [...new Set(indices)];
  let isStraight = false;
  let straightHigh = indices[0];
  if (unique.length === 5) {
    if (indices[0] - indices[4] === 4) {
      isStraight = true;
      straightHigh = indices[0];
    } else if (indices[0] === 12 && indices[1] === 3 && indices[2] === 2 && indices[3] === 1 && indices[4] === 0) {
      // Wheel: A-2-3-4-5, ace plays as low
      isStraight = true;
      straightHigh = 3; // 5-high straight
    }
  }

  // Count rank frequencies
  const freq = {};
  for (const idx of indices) freq[idx] = (freq[idx] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([idx, cnt]) => ({ idx: Number(idx), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.idx - a.idx);
  const counts = groups.map(g => g.cnt);

  let tiebreaker;
  let rank;

  if (isFlush && isStraight) {
    rank = 8;
    tiebreaker = [straightHigh];
  } else if (counts[0] === 4) {
    rank = 7;
    tiebreaker = groups.map(g => g.idx);
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 6;
    tiebreaker = groups.map(g => g.idx);
  } else if (isFlush) {
    rank = 5;
    tiebreaker = indices;
  } else if (isStraight) {
    rank = 4;
    tiebreaker = [straightHigh];
  } else if (counts[0] === 3) {
    rank = 3;
    tiebreaker = groups.map(g => g.idx);
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 2;
    tiebreaker = groups.map(g => g.idx);
  } else if (counts[0] === 2) {
    rank = 1;
    tiebreaker = groups.map(g => g.idx);
  } else {
    rank = 0;
    tiebreaker = indices;
  }

  return { rank, name: HAND_NAMES[rank], tiebreaker };
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function compareHands(h1, h2) {
  if (h1.rank !== h2.rank) return h1.rank > h2.rank ? 1 : -1;
  for (let i = 0; i < Math.min(h1.tiebreaker.length, h2.tiebreaker.length); i++) {
    if (h1.tiebreaker[i] !== h2.tiebreaker[i]) {
      return h1.tiebreaker[i] > h2.tiebreaker[i] ? 1 : -1;
    }
  }
  return 0;
}

function bestHandFrom7(cards) {
  // Find best 5-card hand from up to 7 cards
  if (cards.length < 5) return null;
  if (cards.length === 5) return evaluate5(cards);

  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const ev = evaluate5(combo);
    if (!best || compareHands(ev, best) > 0) best = ev;
  }
  return best;
}

// Given a map of playerId -> Card[], find the winner(s)
function findWinners(playerHands) {
  // playerHands: array of { id, cards }
  let best = null;
  const evaluations = [];

  for (const { id, cards } of playerHands) {
    const ev = bestHandFrom7(cards);
    evaluations.push({ id, ev });
    if (!best || compareHands(ev, best.ev) > 0) best = { id, ev };
  }

  const winners = evaluations
    .filter(e => e.ev && best && compareHands(e.ev, best.ev) === 0)
    .map(e => e.id);

  return { winners, evaluations };
}

module.exports = { evaluate5, bestHandFrom7, compareHands, findWinners, HAND_NAMES };
