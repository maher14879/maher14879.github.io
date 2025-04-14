const wordLinks = {
    "Orbita": '<a href="orbita.html" >Orbita</a>',
    "Cluster": '<a href="cluster.html" >Cluster</a>',
    "GitHub": '<a href="https://github.com/maher14879" target="_blank" >GitHub</a>',
};

function replaceWordsWithLinks(text) {
    Object.keys(wordLinks).forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        text = text.replace(regex, wordLinks[word]);
    });
    return text;
}

const boxShadow = `0 0 7px 1px grey, 0 0 7px 1px grey`;
const mouseMoveDelay = 10; // Throttle mousemove event to every 10ms
const mouseSmooth = 0.01
const waveSmooth = 0.1;
const dotsCount = 50;

height = window.innerHeight;
width = window.innerWidth;

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;

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
        if (this.posY >= height) {
            this.posY = 1;
        } else if (this.posY <= 0) {
            this.posY = height - 1;
        }
    
        if (this.posX >= width) {
            this.posX = 1;
        } else if (this.posX <= 0) {
            this.posX = width - 1;
        }
    
        this.dot.style.left = `${this.posX}px`;
        this.dot.style.top = `${this.posY}px`;
    }

    add_pos(x, y) {
        this.posX -= x * this.scale * this.speed;
        this.posY -= y * this.scale * this.speed;
        this.updatePosition();
    }
    
}

function createRandomDot() {
    const randomX = Math.random() * width;
    const randomY = Math.random() * height;
    const dot = new Dot(randomX, randomY, Math.random() ** 2);
    dots.push(dot);
}

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
        for (let i = 0; i < dotsCount; i++) {
            createRandomDot();
        }
    } else {
        storedDots.forEach(({ x, y, scale }) => {
            const dot = new Dot(x, y, scale);
            dots.push(dot);
        });
    }

    if (dots.length < dotsCount) {
        for (let i = dots.length; i < dotsCount; i++) {
            createRandomDot();
        }
    }

    const storedDelta = JSON.parse(localStorage.getItem('deltaPosition') || '{"x":0,"y":0}');
    deltaPosition_x = storedDelta.x;
    deltaPosition_y = storedDelta.y;
}

loadDotsFromStorage();
window.addEventListener('beforeunload', () => {
    saveDotsToStorage();
});


let isPlaying = false;
let currentFrequency = 440;

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('playButton').addEventListener('click', function() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = currentFrequency;
        oscillator.connect(audioContext.destination);

        isPlaying = true;
        console.log(`Playing ${currentFrequency}Hz`);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1);

        oscillator.onended = () => {
            isPlaying = false;
            console.log("Sound stopped");
        };
    });
});


document.addEventListener('mousemove', (event) => {
    const now = Date.now();
    if (now - lastMouseMove > mouseMoveDelay) {
        targetX = event.clientX - width / 2;
        targetY = event.clientY - height / 2;
        deltaPosition_x += (targetX - deltaPosition_x) * mouseSmooth;
        deltaPosition_y += (targetY - deltaPosition_y) * mouseSmooth;
        height = window.innerHeight;
        width = window.innerWidth;
    };
  }
);

function animateDots() {
    period = 1 / currentFrequency;
    dots.forEach(dot => {
        if (!isPlaying) {
            dot.add_pos(deltaPosition_x, deltaPosition_y);
        } else {
            force_x = Math.cos(deltaPosition_x * period * width) * waveSmooth;
            force_y = Math.sin(deltaPosition_y * period * height) * waveSmooth;
            dot.add_pos(force_x, force_y);
            dot.updatePosition();
        }
    });
    requestAnimationFrame(animateDots);
}
animateDots();