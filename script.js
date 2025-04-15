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
const dotsCount = 50;
const periodScaler = 10;

height = window.innerHeight;
width = window.innerWidth;

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;

const waveSmooth = 200;

let tracks = [];
let isPlaying = false;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let startTime = 0;

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

class Note {
    constructor(frequency, duration, time) {
        this.frequency = frequency;
        this.duration = duration;
        this.time = time;
    }
}

class Track {
    constructor(posX, posY, type, midi_trackk) {
        this.posX = posX;
        this.posY = posY;
        this.type = type;
        this.notes = [];
        for (let note of midi_trackk.notes) {
            this.notes.push(new Note(note.midi, note.duration, note.time));
        }
    }
    play(startTime) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = this.type;
        oscillator.frequency.setValueAtTime(this.notes[0].frequency, startTime + this.notes[0].time);
        oscillator.connect(audioContext.destination);
        oscillator.start(startTime + this.notes[0].time);
        for (let i = 1; i < this.notes.length; i++) {
            oscillator.frequency.setValueAtTime(this.notes[i].frequency, startTime + this.notes[i].time);
        }
        const end = this.notes[this.notes.length - 1];
        oscillator.stop(startTime + end.time + end.duration);
    }    
    getCurrentPeriod(nowTime) {
        for (let note of this.notes) {
            const start = note.time;
            const end = note.time + note.duration;
            if (start <= nowTime && nowTime <= end) {
                return periodScaler / note.frequency;
            }
        }
        return null;
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

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('midiInput').addEventListener('change', async function(parameter) {
        const {Midi} = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/+esm');
        const file = parameter.target.files[0];
        if (!file) return;
        const arrayBuffer = await file.arrayBuffer();
        const midi = new Midi(arrayBuffer);

        isPlaying = true;

        const trackData = [
            [0, 0, 'sine'],
            [width, 0, 'triangle'],
            [0, height, 'square'],
            [width, height, 'sawtooth'],
        ];
        
        for (let i = 0; i < Math.min(1, midi.tracks.length); i++) {
            const [x, y, type] = trackData[i];
            tracks.push(new Track(x, y, type, midi.tracks[i]));
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.onstatechange = () => {
            if (audioContext.state === 'closed') {
                isPlaying = false;
            }
        };

        startTime = audioContext.currentTime;
        for (let track of tracks) {
            track.play(startTime);
        } 
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
    dots.forEach(dot => {
        if (!isPlaying) {
            dot.add_pos(deltaPosition_x, deltaPosition_y);
        } else {
            force_x = 0;
            force_y = 0;
            const nowTime = audioContext.currentTime - startTime;
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const period = track.getCurrentPeriod(nowTime);
                if (period != null) {
                    force_x += Math.cos((dot.posX - track.posX) * period) * waveSmooth;
                    force_y += Math.cos((dot.posY - track.posY) * period) * waveSmooth;
                }
            }
            dot.add_pos(force_x, force_y);
        }
    });
    requestAnimationFrame(animateDots);
}
animateDots();