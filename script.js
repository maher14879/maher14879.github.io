class Dot {
    constructor(x, y, color = 'white') {
        this.scale = Math.random()
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale * 5}px`;
        this.dot.style.height = `${this.scale * 5}px`;
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

    add_pos(x, y) {
        this.posX += x;
        this.posY += y;
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
let deltaPosition = { x: 0, y: 0 };

document.addEventListener('mousemove', (event) => {
    if (Math.abs(event.clientX - mousePosition.x < 10)) {
        deltaPosition.x = event.clientX - mousePosition.x;
    }
    if (Math.abs(event.clientY - mousePosition.y) < 10) {
        deltaPosition.y = event.clientY - mousePosition.y;
    }

    mousePosition.x = event.clientX;
    mousePosition.y = event.clientY;

});