const boxShadow = `0 0 7px 1px grey, 0 0 7px 1px grey`;

class Dot {
    constructor(x, y, scale, color = 'white') {
        this.scale = scale;
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale * 3 + 1}px`;
        this.dot.style.height = `${this.scale * 3 + 1}px`;
        this.dot.style.backgroundColor = color;
        this.dot.style.pointerEvents = 'none';
        this.dot.style.boxShadow = boxShadow;

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

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 3;

function createRandomDot() {
    const randomX = Math.random() * window.innerWidth;
    const randomY = Math.random() * window.innerHeight;
    const dot = new Dot(randomX, randomY, Math.random() ** 2);
    dots.push(dot);
}

document.addEventListener('mousemove', (event) => {
    deltaPosition_x = (event.clientX - window.innerWidth / 2);
    deltaPosition_y = (event.clientY - window.innerHeight / 2);
});

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(deltaPosition_x * 0.01, deltaPosition_y * 0.01);
    });
    requestAnimationFrame(animateDots);
}

animateDots();

function saveDotsToStorage() {
    const dotData = dots.map(dot => ({ 
        x: dot.posX, 
        y: dot.posY, 
        scale: dot.scale 
    }));
    localStorage.setItem('dots', JSON.stringify(dotData));

    const deltaData = { x: deltaPosition_x, y: deltaPosition_y };
    localStorage.setItem('deltaPosition', JSON.stringify(deltaData));
}

function loadDotsFromStorage() {
    const storedDots = JSON.parse(localStorage.getItem('dots') || '[]');
    if (storedDots.length === 0) {
        for (let i = 0; i < 60; i++) {
            createRandomDot();
        }
    } else {
        storedDots.forEach(({ x, y, scale }) => {
            const dot = new Dot(x, y, scale);
            dots.push(dot);
        });
    }

    const storedDelta = JSON.parse(localStorage.getItem('deltaPosition') || '{"x":0,"y":0}');
    deltaPosition_x = storedDelta.x;
    deltaPosition_y = storedDelta.y;
}

loadDotsFromStorage();
window.addEventListener('beforeunload', () => {
    saveDotsToStorage();
});

