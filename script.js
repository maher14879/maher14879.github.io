class MovingDot {
    constructor() {
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = '20px';
        this.dot.style.height = '20px';
        this.dot.style.backgroundColor = 'white';
        this.dot.style.borderRadius = '50%';
        this.dot.style.pointerEvents = 'none';
        document.body.appendChild(this.dot);

        this.dotX = (1 - Math.random()) * window.innerWidth;
        this.dotY = (1 - Math.random()) * window.innerHeight;

        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;

        this.lastMouseX = this.mouseX;
        this.lastMouseY = this.mouseY;

        this.jump = 5; // How much the dot moves in response to mouse movement
        this.deltaMouse = { x: 0, y: 0 };

        this.inactiveLimit = 1000; // Time limit before reset
        this.lastMoveTime = Date.now();

        this.updateDotPosition();
    }

    updateDotPosition() {
        // Only update dot position if the mouse has moved
        if (this.deltaMouse.x !== 0 || this.deltaMouse.y !== 0) {
            // Move the dot based on the mouse movement delta
            this.dotX += this.deltaMouse.x * 0.1; // Slight movement
            this.dotY += this.deltaMouse.y * 0.1; // Slight movement
        }

        this.dot.style.left = `${this.dotX - this.dot.offsetWidth / 2}px`;
        this.dot.style.top = `${this.dotY - this.dot.offsetHeight / 2}px`;

        requestAnimationFrame(this.updateDotPosition.bind(this)); // Keep updating position
    }

    setMousePosition(x, y) {
        // Calculate the delta movement of the mouse
        this.deltaMouse.x = x - this.lastMouseX;
        this.deltaMouse.y = y - this.lastMouseY;

        this.lastMouseX = x;
        this.lastMouseY = y;

        // Reset the dot position after some time if the mouse stops moving
        const deltaTime = Date.now() - this.lastMoveTime;
        if (deltaTime > this.inactiveLimit) {
            this.resetDotPositions();
        }

        this.lastMoveTime = Date.now();
    }

    resetDotPositions() {
        // Reset dot position when mouse is too stationary
        this.dotX = (1 - Math.random()) * window.innerWidth;
        this.dotY = (1 - Math.random()) * window.innerHeight;
    }
}

// Create multiple dots
const dots = [];
for (let i = 0; i < 5; i++) {
    dots.push(new MovingDot());
}

// Update the mouse position for all dots
document.addEventListener('mousemove', (e) => {
    dots.forEach(dot => {
        dot.setMousePosition(e.clientX, e.clientY);
    });
});

