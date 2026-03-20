// Main entry point
let game = null;

// House selection
document.querySelectorAll('.house-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const house = btn.dataset.house;
        document.getElementById('main-menu').classList.add('hidden');

        game = new Game(house);
        game.start();

        // Music toggle button
        const musicBtn = document.getElementById('music-toggle');
        if (musicBtn) {
            musicBtn.addEventListener('click', () => {
                const playing = game.audio.toggleMusic();
                musicBtn.textContent = playing ? '🎵 Music: ON' : '🔇 Music: OFF';
            });
        }
    });
});
