class Dot {
    constructor(x, y, size = 20, color = 'white') {
        // Create the dot element
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${size}px`;
        this.dot.style.height = `${size}px`;
        this.dot.style.backgroundColor = color;
        this.dot.style.pointerEvents = 'none';

        this.posX = x;
        this.posY = y;

        document.body.appendChild(this.dot);
        this.updatePosition();
    }

    updatePosition() {
        this.dot.style.left = `${this.posX}px`;
        this.dot.style.top = `${this.posY}px`;
    }

    moveTo(x, y) {
        this.posX = x;
        this.posY = y;
        this.updatePosition();
    }
}

function generateRandomDots(numDots) {
    for (let i = 0; i < numDots; i++) {
        const randomX = Math.random() * window.innerWidth;
        const randomY = Math.random() * window.innerHeight;
        new Dot(randomX, randomY);
    }
}

generateRandomDots(10);

let mousePosition = { x: 0, y: 0 };

document.addEventListener('mousemove', (event) => {
    mousePosition.x = event.clientX;
    mousePosition.y = event.clientY;

});