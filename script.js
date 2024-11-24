class StarParticle {
    constructor(player) {
        // Create the particle (a simple dot)
        this.scale = Math.random() * 100 + 10;  // Random scale between 10 and 100
        this.player = player;

        // Create a div for the particle
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale / 20}px`;
        this.dot.style.height = `${this.scale / 20}px`;
        this.dot.style.backgroundColor = 'white';
        this.dot.style.borderRadius = '50%';
        this.dot.style.pointerEvents = 'none';
        document.body.appendChild(this.dot);

        // Initial position
        this.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        this.updatePosition();
    }

    // Method to update position based on mouse position
    updatePosition() {
        // Move the particle according to the mouse, scaled by 'scale'
        this.pos.x = this.player.mouseX - this.scale / 40;
        this.pos.y = this.player.mouseY - this.scale / 40;

        this.dot.style.left = `${this.pos.x}px`;
        this.dot.style.top = `${this.pos.y}px`;
    }
}

let player = { mouseX: window.innerWidth / 2, mouseY: window.innerHeight / 2 };

// Update mouse position on move
document.addEventListener('mousemove', (e) => {
    player.mouseX = e.clientX;
    player.mouseY = e.clientY;
});

// Create and track particles
let particles = [];
for (let i = 0; i < 5; i++) {
    particles.push(new StarParticle(player));
}

// Update particles
function updateParticles() {
    particles.forEach(particle => {
        particle.updatePosition();
    });

    requestAnimationFrame(updateParticles);
}

// Start updating particles
updateParticles();
