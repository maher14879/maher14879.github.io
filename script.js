const boxShadow = `0 0 7px 1px grey, 0 0 7px 1px grey`;

class Dot {
    constructor(x, y, color = 'white') {
        this.scale = Math.random() ** 2
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale * 5 + 1}px`;
        this.dot.style.height = `${this.scale * 5 + 1}px`;
        this.dot.style.backgroundColor = color;
        this.dot.style.pointerEvents = 'none';
        this.dot.style.boxShadow = boxShadow

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
    
        if (this.posY >= window.innerHeight) {
            this.posY = 1;
        } else if (this.posY <= 0) {
            this.posY = window.innerHeight - 1;
        }
    
        if (this.posX >= window.innerWidth) {
            this.posX = 1;
        } else if (this.posX <= 0) {
            this.posX = window.innerWidth - 1;
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

let mousePosition = 0;
let deltaPosition = 0;

document.addEventListener('mousemove', (event) => {
    deltaPosition = event.clientX - mousePosition
    mousePosition = event.clientX;
    if (Math.abs(deltaPosition) > 100) {
        deltaPosition = Math.sign(deltaPosition) * 100
    }

    dots.forEach(
        dot => {
            dot.add_pos(deltaPosition * 0.3, 0);
        }
    );
}
);

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(Math.sin((dot.x + dot.y) * 0.001) * 10, 3);
    });
    requestAnimationFrame(animateDots);
}

animateDots();