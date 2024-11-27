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

let mousePosition_x = 0;
let mousePosition_y = 0;
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastTime = performance.now();

document.addEventListener('mousemove', (event) => {
    const currentTime = performance.now();
    deltaTime = (currentTime - lastTime) * 0.001; 
    lastTime = currentTime;

    deltaPosition_x = (event.clientX - mousePosition_x) * deltaTime
    deltaPosition_y = (event.clientX - mousePosition_y) * deltaTime
    mousePosition_y += deltaPosition_x;
    mousePosition_x += deltaPosition_y;
    dots.forEach(
        dot => {
            dot.add_pos(deltaPosition_x, deltaPosition_y);
        }
    );
});

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(0, 3);
    });
    requestAnimationFrame(animateDots);
}

animateDots();