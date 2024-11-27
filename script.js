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

function saveDotsToStorage() {
    const dotData = dots.map(dot => ({ x: dot.posX, y: dot.posY, scale: dot.scale }));
    localStorage.setItem('dots', JSON.stringify(dotData));
}

function loadDotsFromStorage() {
    const storedDots = JSON.parse(localStorage.getItem('dots') || '[]');
    storedDots.forEach(({ x, y }) => dots.push(new Dot(x, y)));
}

function saveDotsToStorage() {
    const dotData = dots.map(dot => ({ x: dot.posX, y: dot.posY, scale: dot.scale }));
    localStorage.setItem('dots', JSON.stringify(dotData));
}

function loadDotsFromStorage() {
    const storedDots = JSON.parse(localStorage.getItem('dots') || '[]');
    storedDots.forEach(({ x, y }) => dots.push(new Dot(x, y)));
}

loadDotsFromStorage();
loadDeltaPosition();
window.addEventListener('beforeunload', () => {
    saveDotsToStorage();
    localStorage.setItem('deltaPosition', JSON.stringify({ x: deltaPosition_x, y: deltaPosition_y }));
});

document.addEventListener('mousemove', (event) => {
    deltaPosition_x = (event.clientX - window.innerWidth / 2)
    deltaPosition_y = (event.clientY - window.innerHeight / 2)
});

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(deltaPosition_x * 0.01, deltaPosition_y * 0.01);
    });
    requestAnimationFrame(animateDots);
}

animateDots();