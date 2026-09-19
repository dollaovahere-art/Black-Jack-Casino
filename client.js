const socket = io();
let mySeat = null;
let lastStatus = "BETTING";

// High-quality public win audio chime URL
const winSound = new Audio("https://pixabay.com");

function drawEmptyTable() {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        grid.innerHTML += `
            <div class="player-box empty-seat" id="seat-${i}">
                <div class="name-label">Seat ${i + 1}</div>
                <div class="player-stats">Empty Chair</div>
                <div class="cards-container"></div>
            </div>`;
    }
}
drawEmptyTable();

function joinGame() {
    const name = document.getElementById('username-input').value.trim();
    if(!name) return alert("Please enter a name first!");
    socket.emit('join-table', name);
}

function sendBet(amount) { socket.emit('place-bet', amount); }
function sendDeal() { socket.emit('request-deal'); }
function sendAction(action) { socket.emit('player-action', action); }

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if(!msg) return;
    socket.emit('send-chat', msg);
    input.value = '';
}

socket.on('seat-assigned', (seatNum) => {
    mySeat = seatNum;
    document.getElementById('join-panel').style.display = 'none';
    // Play a quick test sound quietly when sitting down to force the browser to wake up its audio engine
    winSound.volume = 0.1;
    winSound.play().catch(e => console.log("Audio waiting for full interaction"));
    winSound.volume = 1.0; // Reset back to full volume
});

socket.on('table-full', (msg) => alert(msg));

socket.on('receive-chat', (data) => {
    const chatBox = document.getElementById('chat-messages');
    chatBox.innerHTML += `<div><strong>${data.user}:</strong> ${data.message}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on('table-updated', (gameState) => {
    // Render the 6 seats
    for (let i = 0; i < 6; i++) {
        const seatBox = document.getElementById(`seat-${i}`);
        const player = Object.values(gameState.players).find(p => p.seat === i);
        
        if (player) {
            seatBox.className = (gameState.activeSeat === i && gameState.status === "PLAYING") ? "player-box active-turn" : "player-box";
            let statusText = player.busted ? " (BUST 💥)" : player.stood ? " (STAND ✅)" : "";
            
            let cardsHTML = '';
            player.cards.forEach(card => {
                cardsHTML += `<div class="card ${card.suit.isRed ? 'red' : ''}">
                    <div>${card.rank}</div>
                    <div class="suit-center">${card.suit.symbol}</div>
                    <div class="corner-bottom">${card.rank}</div>
                </div>`;
            });

            seatBox.innerHTML = `
                <div class="name-label">${player.name} ${mySeat === i ? '(You)' : ''}</div>
                <div class="player-stats">Bank: $${player.bank} | Bet: $${player.bet}</div>
                <div class="hand-title">Score: ${player.score}${statusText}</div>
                <div class="cards-container">${cardsHTML}</div>
            `;
        } else {
            seatBox.className = "player-box empty-seat";
            seatBox.innerHTML = `<div class="name-label">Seat ${i + 1}</div><div class="player-stats">Empty Chair</div><div class="cards-container"></div>`;
        }
    }

    // Render Dealer Window
    const dCardsDiv = document.getElementById('dealer-cards');
    dCardsDiv.innerHTML = '';
    gameState.dealer.cards.forEach((card, idx) => {
        if (idx === 1 && gameState.hideDealerCard) {
            dCardsDiv.innerHTML += `<div class="card hidden-card"></div>`;
        } else {
            dCardsDiv.innerHTML += `<div class="card ${card.suit.isRed ? 'red' : ''}">
                <div>${card.rank}</div>
                <div class="suit-center">${card.suit.symbol}</div>
                <div class="corner-bottom">${card.rank}</div>
            </div>`;
        }
    });
    document.getElementById('dealer-title').innerText = gameState.hideDealerCard ? "Dealer: ?" : `Dealer: ${gameState.dealerScore}`;
    document.getElementById('status-message').innerText = gameState.message;

    // Manage Buttons
    const amIActive = (mySeat !== null && gameState.players[socket.id] && gameState.players[socket.id].seat === gameState.activeSeat);
    document.getElementById('bet-10-btn').disabled = (mySeat === null || gameState.status !== "BETTING");
    document.getElementById('all-in-btn').disabled = (mySeat === null || gameState.status !== "BETTING");
    document.getElementById('deal-btn').disabled = (mySeat === null || gameState.status !== "BETTING");
    
    document.getElementById('hit-btn').disabled = (!amIActive || gameState.status !== "PLAYING");
    document.getElementById('double-btn').disabled = (!amIActive || gameState.status !== "PLAYING");
    document.getElementById('stand-btn').disabled = (!amIActive || gameState.status !== "PLAYING");

    // AUDIO TRIGGER CHECKS
    if (gameState.status === "BETTING" && lastStatus === "PLAYING") {
        const myPlayerData = Object.values(gameState.players).find(p => p.seat === mySeat);
        if (myPlayerData && !myPlayerData.busted) {
            let dScore = gameState.dealerScore;
            let myScore = myPlayerData.score;
            if (dScore > 21 || myScore > dScore) {
                winSound.play().catch(err => console.log("Audio permission block:", err));
            }
        }
    }
    lastStatus = gameState.status;
});
