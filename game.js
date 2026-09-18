let deck = [], dealer = { cards: [] }, activePlayerIndex = 0, gameState = "BETTING";
let players = [
    { id: 0, name: "Player 1", cards: [], bank: 500, bet: 0, busted: false, stood: false },
    { id: 1, name: "Player 2", cards: [], bank: 500, bet: 0, busted: false, stood: false },
    { id: 2, name: "Player 3", cards: [], bank: 500, bet: 0, busted: false, stood: false },
    { id: 3, name: "Player 4", cards: [], bank: 500, bet: 0, busted: false, stood: false }
];
const suits = [{ symbol: '♠', isRed: false }, { symbol: '♥', isRed: true }, { symbol: '♦', isRed: true }, { symbol: '♣', isRed: false }];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    deck = [];
    for (let d = 0; d < 4; d++) {
        for (let suit of suits) {
            for (let rank of ranks) {
                let value = parseInt(rank);
                if (['J', 'Q', 'K'].includes(rank)) value = 10;
                if (rank === 'A') value = 11;
                deck.push({ suit, rank, value });
            }
        }
    }
}
function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}
function updateNames() { players.forEach(p => p.name = document.getElementById(`p${p.id}-name`).value); }
function calculateScore(cards) {
    let total = 0, aces = 0;
    for (let c of cards) { total += c.value; if (c.rank === 'A') aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}
function updateStatsUI() {
    players.forEach(p => {
        document.getElementById(`p${p.id}-stats`).innerText = `Bank: $${p.bank} | Bet: $${p.bet}`;
        document.getElementById(`bail-${p.id}`).style.display = (p.bank === 0 && p.bet === 0) ? "inline-block" : "none";
    });
}
function bailout(id) { players[id].bank = 500; updateStatsUI(); }
function placeBet(id, amt) {
    if (gameState !== "BETTING") return;
    let p = players[id];
    if (amt === 'all') { p.bet += p.bank; p.bank = 0; }
    else if (p.bank >= amt) { p.bank -= amt; p.bet += amt; }
    updateStatsUI();
}
function startRound() {
    players.forEach(p => { if (p.bet === 0 && p.bank >= 10) { p.bank -= 10; p.bet = 10; } });
    updateStatsUI(); gameState = "PLAYING"; updateNames(); createDeck(); shuffleDeck();
    players.forEach(p => {
        p.cards = []; p.busted = false; p.stood = false;
        document.getElementById(`p${p.id}-name`).disabled = true;
        document.getElementById(`p${p.id}-box`).classList.remove('active-turn');
    });
    dealer.cards = [];
    for (let i = 0; i < 2; i++) { players.forEach(p => p.cards.push(deck.pop())); dealer.cards.push(deck.pop()); }
    document.getElementById('deal-btn').disabled = true;
    document.getElementById('reset-btn').disabled = true;
    toggleBetButtons(true);
    document.getElementById('hit-btn').disabled = false;
    document.getElementById('double-btn').disabled = false;
    document.getElementById('stand-btn').disabled = false;
    activePlayerIndex = 0; renderTable(true); moveToNextValidPlayer();
}
function toggleBetButtons(disable) {
    for(let i=0; i<4; i++) {
        document.getElementById(`b${i}-btn`).disabled = disable;
        document.getElementById(`allin${i}-btn`).disabled = disable;
    }
}
function renderCardUI(card, isHidden) {
    const div = document.createElement('div');
    if (isHidden) { div.className = 'card hidden-card'; return div; }
    div.className = card.suit.isRed ? 'card red' : 'card';
    div.innerHTML = `<div>${card.rank}</div><div class="suit-center">${card.suit.symbol}</div><div class="corner-bottom">${card.rank}</div>`;
    return div;
}
function renderTable(hideDealer) {
    const dDiv = document.getElementById('dealer-cards'); dDiv.innerHTML = '';
    dealer.cards.forEach((c, idx) => dDiv.appendChild(renderCardUI(c, idx === 1 && hideDealer)));
    document.getElementById('dealer-title').innerText = hideDealer ? "Dealer: ?" : `Dealer: ${calculateScore(dealer.cards)}`;
    players.forEach(p => {
        const pDiv = document.getElementById(`p${p.id}-cards`); pDiv.innerHTML = '';
        p.cards.forEach(c => pDiv.appendChild(renderCardUI(c, false)));
        let score = calculateScore(p.cards);
        document.getElementById(`p${p.id}-title`).innerText = `Score: ${score}` + (p.busted ? " (BUST 💥)" : p.stood ? " (STAND ✅)" : "");
    });
}
function moveToNextValidPlayer() {
    players.forEach(p => document.getElementById(`p${p.id}-box`).classList.remove('active-turn'));
    if (activePlayerIndex >= players.length) { executeDealerTurn(); return; }
    let p = players[activePlayerIndex];
    document.getElementById(`p${p.id}-box`).classList.add('active-turn');
    document.getElementById('status-message').innerText = `👉 ${p.name}'s Turn! Hit, Double, or Stand?`;
    if (calculateScore(p.cards) === 21) { p.stood = true; activePlayerIndex++; renderTable(true); moveToNextValidPlayer(); }
}
function hit() {
    if (gameState !== "PLAYING") return;
    let p = players[activePlayerIndex]; p.cards.push(deck.pop());
    let s = calculateScore(p.cards); renderTable(true);
    if (s >= 21) { if (s > 21) p.busted = true; else p.stood = true; activePlayerIndex++; moveToNextValidPlayer(); }
}
function stand() { if (gameState !== "PLAYING") return; players[activePlayerIndex].stood = true; renderTable(true); activePlayerIndex++; moveToNextValidPlayer(); }

function doubleDown() {
    if (gameState !== "PLAYING") return;
    let p = players[activePlayerIndex];
    if (p.bank >= p.bet) {
        p.bank -= p.bet;
        p.bet = p.bet * 2;
        updateStatsUI();
        p.cards.push(deck.pop());
        if (calculateScore(p.cards) > 21) p.busted = true;
        renderTable(true);
        activePlayerIndex++;
        moveToNextValidPlayer();
    } else {
        alert("Not enough chips to Double Down!");
    }
}

function executeDealerTurn() {
    document.getElementById('hit-btn').disabled = true;
    document.getElementById('double-btn').disabled = true;
    document.getElementById('stand-btn').disabled = true;
    renderTable(false);
    if (calculateScore(dealer.cards) >= 17) { resolveBetsAndPayouts(); return; }
    dealNextDealerCard();
}
function dealNextDealerCard() {
    if (calculateScore(dealer.cards) >= 17) { resolveBetsAndPayouts(); return; }
    dealer.cards.push(deck.pop());
    renderTable(false);
    setTimeout(dealNextDealerCard, 800);
}
function resolveBetsAndPayouts() {
    let dScore = calculateScore(dealer.cards);
    players.forEach(p => {
        let pScore = calculateScore(p.cards);
        if (p.busted) p.bet = 0;
        else if (dScore > 21 || pScore > dScore) { p.bank += p.bet * 2; p.bet = 0; }
        else if (pScore < dScore) p.bet = 0;
        else { p.bank += p.bet; p.bet = 0; }
    });
    document.getElementById('status-message').innerText = "🏁 Round Complete! Set bets for the next deal.";
    updateStatsUI(); gameState = "BETTING"; document.getElementById('deal-btn').disabled = false; document.getElementById('reset-btn').disabled = false;
    players.forEach(p => document.getElementById(`p${p.id}-name`).disabled = false); toggleBetButtons(false);
}
function resetEntireGame() {
    if (gameState !== "BETTING") return;
    players.forEach((p, idx) => {
        p.bank = 500; p.bet = 0; p.cards = []; p.busted = false; p.stood = false;
        document.getElementById(`p${idx}-name`).value = `Player ${idx + 1}`; document.getElementById(`p${idx}-name`).disabled = false;
    });
    dealer.cards = []; activePlayerIndex = 0; document.getElementById('status-message').innerText = "Table reset! Place bets and play!";
    updateNames(); updateStatsUI(); renderTable(true);
}
