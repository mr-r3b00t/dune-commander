// Main entry point
let game = null;

function startGame(house, loadSave) {
    document.getElementById('main-menu').classList.add('hidden');

    game = new Game(house);
    game.start();

    if (loadSave) {
        if (game.loadGame()) {
            game.ui.showStatus('📂 Saved game loaded!');
        }
    }

    // Music toggle button
    const musicBtn = document.getElementById('music-toggle');
    if (musicBtn) {
        musicBtn.addEventListener('click', () => {
            const playing = game.audio.toggleMusic();
            musicBtn.textContent = playing ? '🎵 Music: ON' : '🔇 Music: OFF';
        });
    }
}

// House selection
document.querySelectorAll('.house-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        startGame(btn.dataset.house, false);
    });
});

// Show "Continue" button if a save exists
(function() {
    var savedData = localStorage.getItem('dune_commander_save');
    if (!savedData) return;
    var savedState = null;
    try { savedState = JSON.parse(savedData); } catch(err) { return; }
    if (!savedState || !savedState.playerHouse) return;

    var menuContent = document.querySelector('.menu-content');
    var continueBtn = document.createElement('button');
    continueBtn.className = 'house-btn';
    continueBtn.id = 'continue-btn';
    continueBtn.style.cssText = 'margin: 0 auto 20px; display: flex; border-color: #e0a030; background: #2a2a1e; width: 220px;';
    var houseName = savedState.playerHouse.charAt(0).toUpperCase() + savedState.playerHouse.slice(1);
    continueBtn.innerHTML = '<span style="color: #e0a030;">▶ CONTINUE</span><small>House ' + houseName + '</small>';
    continueBtn.addEventListener('click', function() {
        startGame(savedState.playerHouse, true);
    });
    var houseSelect = menuContent.querySelector('.house-select');
    menuContent.insertBefore(continueBtn, houseSelect);
})();
