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
const dotsCount = 20;
const maxDots = 100;
const periodScaler = 50;
const spawnSpeed = 0.1;

height = window.innerHeight;
width = window.innerWidth;

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;

let tracks = [];
let isPlaying = false;
let startTime = 0;
let endTime = 0;
let noteFadeIn = 0.1;
let noteFadeOut = 0.1;
let lastTime = 0;
let spawnDot = 0;

const waveSmooth = 200;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

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
    constructor(frequency, time, duration) {
        this.frequency = frequency;
        this.time = time;
        this.duration = duration;
    }
}

class Track {
    constructor(posX, posY, type, midi_trackk) {
        this.posX = posX;
        this.posY = posY;
        this.type = type;
        this.notes = [];
        
        for (let note of midi_trackk.notes) {
            this.notes.push(new Note(440 * Math.pow(2, (note.midi - 69) / 12), note.time, note.duration));
        }
    }
    play(startTime) {
        for (let i = 0; i < this.notes.length; i++) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.type = this.type;

            oscillator.frequency.setValueAtTime(this.notes[i].frequency, startTime + this.notes[i].time);
        
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start(Math.max(0, startTime + this.notes[i].time - noteFadeIn));
            gainNode.gain.linearRampToValueAtTime(1, startTime + this.notes[i].time + noteFadeIn);
            gainNode.gain.linearRampToValueAtTime(0, startTime + this.notes[i].time + this.notes[i].duration + noteFadeOut);
            oscillator.stop(startTime + this.notes[i].time + this.notes[i].duration + noteFadeOut);
            
            endTime = Math.max(startTime + this.notes[i].time + this.notes[i].duration + noteFadeOut, endTime);
        }
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

        const noteFadeOutSlider = document.getElementById('noteFadeOut');
        const noteFadeInSlider = document.getElementById('noteFadeIn');

        noteFadeOut = parseFloat(noteFadeOutSlider.value);
        noteFadeIn = parseFloat(noteFadeInSlider.value);

        isPlaying = true;

        const positions = [
            [50, 50, 'sine'],
            [width - 50, 50, 'triangle'],
            [50, height - 50, 'square'],
            [width - 50, height - 50, 'sawtooth'],
        ];

        let position_index = 0;
        for (let i = 0; i < midi.tracks.length; i++) {
            const [x, y, sound_type] = positions[position_index];
            const track = new Track(x, y, sound_type, midi.tracks[i]);
            if (track.notes.length > 0) {
                tracks.push(track);
                position_index++;
            }
            if (position_index >= 4) {
                break;
            }
        }

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
    if (dots.length > maxDots) {
        dots = dots.slice(0, maxDots);
    }

    if (!isPlaying) {
        dots.forEach(dot => {
            dot.add_pos(deltaPosition_x, deltaPosition_y);
            })
        } else {
            if (audioContext.currentTime > endTime) {
                audioContext.suspend();
                isPlaying = false;
            }
            dots.forEach(dot => {
                force_x = 0;
                force_y = 0;
                const nowTime = audioContext.currentTime - startTime;
                lastTime = nowTime;
                spawnDot += nowTime - lastTime
                for (let i = 0; i < tracks.length; i++) {
                    const track = tracks[i];
                    const period = track.getCurrentPeriod(nowTime);
                    if (period != null) {
                        force_x += Math.cos((dot.posX - track.posX) * period) * waveSmooth;
                        force_y += Math.cos((dot.posY - track.posY) * period) * waveSmooth;
                        if (spawnDot > spawnSpeed) {
                            const dot = new Dot(track.posX, track.posY, Math.random() ** 2);
                            dots.push(dot);
                        }
                    }
                }
                if (spawnDot > spawnSpeed) {spawnDot -= spawnSpeed}
                dot.add_pos(deltaPosition_x + force_x, deltaPosition_y + force_y);
            })
        }
    requestAnimationFrame(animateDots);
}
animateDots();