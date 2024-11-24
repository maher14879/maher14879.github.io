class Dot {
    constructor(x, y, size = 20, color = 'white') {
        // Create the dot element
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${size}px`;
        this.dot.style.height = `${size}px`;
        this.dot.style.backgroundColor = color;
        this.dot.style.borderRadius = '50%';  // Make it round
        this.dot.style.pointerEvents = 'none';  // Don't interfere with mouse events

        // Set initial position
        this.posX = x;
        this.posY = y;

        // Append the dot to the document body
        document.body.appendChild(this.dot);

        // Update position
        this.updatePosition();
    }

    // Method to update the position of the dot
    updatePosition() {
        this.dot.style.left = `${this.posX}px`;
        this.dot.style.top = `${this.posY}px`;
    }

    // Method to move the dot to a new position
    moveTo(x, y) {
        this.posX = x;
        this.posY = y;
        this.updatePosition();
    }
}

function generateRandomDots(numDots) {
    for (let i = 0; i < numDots; i++) {
        // Generate random position within the window dimensions
        const randomX = Math.random() * window.innerWidth;
        const randomY = Math.random() * window.innerHeight;
        
        // Create a new dot at the random position
        new Dot(randomX, randomY);
    }
}

// Generate 10 random dots
generateRandomDots(10);