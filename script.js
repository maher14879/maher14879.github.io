const boxShadow = `0 0 7px 1px grey, 0 0 7px 1px grey`;
const viewportHeight = document.documentElement.clientHeight;
const viewportWidth = document.documentElement.clientWidth;

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 3;

let lastMouseMove = 0;
const mouseMoveDelay = 10; // Throttle mousemove event to every 10ms
const mouseSmooth = 0.01

class Dot {
    constructor(x, y, scale, color = 'white') {
        this.scale = scale;
        this.speed = 0.1
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
        this.posX -= x * this.scale * this.speed;
        this.posY -= y * this.scale * this.speed;
    
        if (this.posY >= viewportHeight) {
            this.posY = 1;
        } else if (this.posY <= 0) {
            this.posY = viewportHeight - 1;
        }
    
        if (this.posX >= viewportWidth) {
            this.posX = 1;
        } else if (this.posX <= 0) {
            this.posX = viewportWidth - 1;
        }
    
        this.updatePosition();
    }
    
}

function createRandomDot() {
    const randomX = Math.random() * viewportWidth;
    const randomY = Math.random() * viewportHeight;
    const dot = new Dot(randomX, randomY, Math.random() ** 2);
    dots.push(dot);
}

document.addEventListener('mousemove', (event) => {
    const now = Date.now();
    if (now - lastMouseMove > mouseMoveDelay) {
        targetX = event.clientX - viewportWidth / 2;
        targetY = event.clientY - viewportHeight / 2;
        deltaPosition_x += (targetX - deltaPosition_x) * mouseSmooth;
        deltaPosition_y += (targetY - deltaPosition_y) * mouseSmooth;
    };
  }
);

function animateDots() {
    dots.forEach(dot => {
        dot.add_pos(deltaPosition_x, deltaPosition_y);
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
        for (let i = 0; i < 10; i++) {
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

const wordLinks = {
    "Orbita": '<a href="orbita.html" >Orbita</a>',
    //"Cluster": '<a href="cluster.html" >Cluster</a>',
    "GitHub": '<a href="https://github.com/maher14879" target="_blank" >GitHub</a>'
};

function replaceWordsWithLinks(text) {
    Object.keys(wordLinks).forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        text = text.replace(regex, wordLinks[word]);
    });
    return text;
}