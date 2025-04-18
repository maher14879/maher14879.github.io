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

const mouseMoveDelay = 10;
const mouseSmooth = 0.01
const mouseSpeed = 0.1
const dotsCount = 20;
const maxDots = 100;
const attract = 0.2
const waveSpeed = -20;
const periodScaler = 1;
const minNote = 0.1;

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;

let tracks = [];
let isPlaying = false;
let startTime = 0;
let endTime = 0;
let Tone = null;

const height = window.innerHeight;
const width = window.innerWidth;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

class Dot {
    constructor(x, y, scale, color = 'white') {
        this.scale = scale;
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale * 3 + 1}px`;
        this.dot.style.height = `${this.scale * 3 + 1}px`;
        this.dot.style.backgroundColor = color;
        this.dot.style.pointerEvents = 'none';
        const grey_scale = `rgb(${255 * (this.scale / 3 + 0.1)}, ${255 * (this.scale / 3 + 0.1)}, ${255 * (this.scale / 3 + 0.1)})`;
        this.dot.style.boxShadow = `0 0 ${this.scale * 2 + 1}px 1px ${grey_scale}, 0 0 ${this.scale * 2 + 1}px 1px ${grey_scale}`;

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
        this.posX -= x;
        this.posY -= y;
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
    constructor(posX, posY, midi_trackk) {
        this.posX = posX;
        this.posY = posY;
        this.notes = [];
        
        for (let note of midi_trackk.notes) {
            this.notes.push(new Note(440 * Math.pow(2, (note.midi - 69) / 12), note.time, note.duration));
        }
    }

    getCurrentPeriod(nowTime) {
        for (let note of this.notes) {
            const start = note.time;
            const end = note.time + (note.duration * 2/3);
            if (start <= nowTime && nowTime <= end) {
                return periodScaler / note.frequency;
            }
        }
        return null;
    }

    play(startTime) {
        for (let i = 0; i < this.notes.length; i++) {
            const frequency = this.notes[i].frequency
            const time = startTime + this.notes[i].time
            const duration = this.notes[i].duration
            const volume = this.notes[i].volume

            const oscillator = audioContext.createOscillator();
            oscillator.type = 'square'

            oscillator.frequency.setValueAtTime(frequency, time);

            oscillator.start(time)
            oscillator.stop(time + Math.max((duration * 2/3), minNote))
            oscillator.connect(audioContext.destination)
            
            endTime = Math.max(time + duration, endTime);
        }
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

window.addEventListener('beforeunload', () => {
    saveDotsToStorage();
});

async function playMidi() {
    let file = document.getElementById('midiInput').files[0];
    if (!file) file = await fetch('assets/midi/v2.mid').then(res => res.blob());
    const {Midi} = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/+esm');
    const arrayBuffer = await file.arrayBuffer();
    const midi = new Midi(arrayBuffer);

    isPlaying = true;
    document.querySelector('.content').remove();

    if (audioContext.state === 'suspended') await audioContext.resume();

    let position_index = 0;
    for (let i = 0; i < midi.tracks.length; i++) {
        if (i % 2) {
            x = Math.round(Math.random()) * width;
            y = Math.random() * height;
        } else {
            x = Math.random() * width;
            y = Math.round(Math.random()) * height;
        }
        const track = new Track(x, y, midi.tracks[i]);
        if (track.notes.length > 0) {
            tracks.push(track);
            position_index++;
        }
        if (position_index >= 4) break;
    }

    startTime = audioContext.currentTime;
    for (let track of tracks) track.play(startTime);
}

document.addEventListener('mousemove', (event) => {
    const now = Date.now();
    if (now - lastMouseMove > mouseMoveDelay) {
        const targetX = event.clientX - width / 2;
        const targetY = event.clientY - height / 2;
        deltaPosition_x += (targetX - deltaPosition_x) * mouseSmooth;
        deltaPosition_y += (targetY - deltaPosition_y) * mouseSmooth;
    };
  }
);

function animateDots() {
    const nowTime = audioContext.currentTime - startTime;
    if (dots.length > maxDots) {
        dots = dots.slice(0, maxDots);
    }

    if (!isPlaying) {
        dots.forEach(dot => {
            dot.add_pos(deltaPosition_x * dot.scale * mouseSpeed, deltaPosition_y * dot.scale * mouseSpeed);
        })
    } else {
        if (audioContext.currentTime > endTime) {
            audioContext.suspend();
            isPlaying = false;
            deltaPosition_x = Math.random() * 100;
            deltaPosition_y = Math.random() * 100;
        }
        const currentDots = [...dots];
        currentDots.forEach(dot => {
            let force_x = 0;
            let force_y = 0;
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                const period = track.getCurrentPeriod(nowTime);
                if (period != null) {
                    const term1 = (dot.posX - track.posX) * period;
                    const term2 = (dot.posY - track.posY) * period;
                    force_x += term1 * Math.sin(term1) * Math.sin(term2) * waveSpeed * Math.sin(nowTime);
                    force_y += term2 * Math.cos(term1) * Math.cos(term2) * waveSpeed * Math.cos(nowTime);
                }
            }

            currentDots.forEach(dotOther => {
                if (dotOther !== dot) {
                    const dx = dotOther.posX - dot.posX
                    const dy = dotOther.posY - dot.posY
                    const distSq = Math.max(1, dx * dx + dy * dy)
                    force_x += (dx / distSq) * attract
                    force_y += (dy / distSq) * attract
                }
            })
            dot.add_pos(force_x, force_y);
        })
    }
    requestAnimationFrame(animateDots);
}

//run
loadDotsFromStorage();
animateDots();