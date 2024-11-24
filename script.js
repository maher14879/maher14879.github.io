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
        this.posX -= x * this.scale;
        this.posY -= y * this.scale;

        if (this.posY > window.innerHeight) {
            this.posY = 0;
        }

        if (this.posX > window.innerWidth) {
            this.posX = 0;
        }

        if (this.posX < 0) {
            this.posX = window.innerWidth;
        }

        this.updatePosition();
    }
}

function createRandomDot() {
    const randomX = Math.random() * window.innerWidth;
    const randomY = Math.random() * window.innerHeight;
    const dot = new Dot(randomX, randomY);
    dots.push(dot);
}
const dots = [];
for (let i = 0; i < 60; i++) {createRandomDot();}

let mousePosition = { x: 0, y: 0 };
let deltaPosition = { x: 0, y: 0 };

document.addEventListener('mousemove', (event) => {
    if (Math.abs(event.clientX - mousePosition.x) < 100) {
        deltaPosition.x = event.clientX - mousePosition.x;
    }
    if (Math.abs(event.clientY - mousePosition.y) < 100) {
        deltaPosition.y = event.clientY - mousePosition.y;
    }

    mousePosition.x = event.clientX;
    mousePosition.y = event.clientY;

    dots.forEach(
        dot => {
            dot.add_pos(deltaPosition.x, deltaPosition.y);
        }
    );
}
);

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(0, dot.scale);
    });
    requestAnimationFrame(animateDots);
}

animateDots();