class StarParticle {
    constructor(pos, player, group) {
        this.group = group;  // The group to which the particle belongs (could be an array or a container)
        this.scale = Math.random() * 100 + 1;  // Random scale (size) of the particle
        this.age = 0;  // Age of the particle (time since creation)
        
        this.player = player;  // Reference to the player (could be the mouse position in your case)
        
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale / 20}px`;
        this.dot.style.height = `${this.scale / 20}px`;
        this.dot.style.backgroundColor = 'white';
        this.dot.style.borderRadius = '50%';
        this.dot.style.pointerEvents = 'none';
        document.body.appendChild(this.dot);
        
        this.pos = { x: pos.x, y: pos.y };
        this.updatePosition();
    }

    updatePosition() {
        this.dot.style.left = `${this.pos.x - this.scale / 40}px`;  // Center the dot
        this.dot.style.top = `${this.pos.y - this.scale / 40}px`;  // Center the dot
    }

    update(dt) {
        // Moving the particle based on the player's direction (adjust as per needs)
        this.pos.x += (-this.scale * this.player.direction.x * 0.01) * dt;
        this.pos.y += (100 - this.scale * this.player.direction.y * 0.01) * dt;
        
        // Update the visual position
        this.updatePosition();
        
        // Age the particle
        this.age += dt;

        // Kill particle when it reaches its scale
        if (this.age > this.scale) {
            this.kill();
        }
    }

    kill() {
        // Remove the particle from the DOM
        this.dot.remove();
        // Optionally remove from group (if you use a group for particles)
        const index = this.group.indexOf(this);
        if (index > -1) {
            this.group.splice(index, 1);  // Remove from group
        }
    }
}


let player = { direction: { x: 0, y: 0 } };

// Update player direction based on mouse movement
document.addEventListener('mousemove', (e) => {
    player.direction.x = (e.clientX - window.innerWidth / 2) / window.innerWidth;
    player.direction.y = (e.clientY - window.innerHeight / 2) / window.innerHeight;
});

// Array to hold particles
let particleGroup = [];

// Create a function to generate multiple particles
function createParticles(numParticles) {
    for (let i = 0; i < numParticles; i++) {
        let pos = {
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight
        };
        let particle = new StarParticle(pos, player, particleGroup);
        particleGroup.push(particle);
    }
}

// Function to update all particles
function updateParticles(dt) {
    particleGroup.forEach(particle => {
        particle.update(dt);
    });
}

// Create 100 particles
createParticles(100);

// Update particles every frame
function gameLoop() {
    let dt = 1 / 60; // Assume 60 FPS for delta time
    updateParticles(dt);
    requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();
