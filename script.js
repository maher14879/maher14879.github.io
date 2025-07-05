let height = window.innerHeight
let width = window.innerWidth

window.addEventListener('resize', () => {
    height = window.innerHeight
    width = window.innerWidth
})

const mouseMoveDelay = 30;
const mouseSmooth = 0.01;
const mouseSpeed = 0.1;
const dotsCount = 40;

const dotAttract = -4;
const waveSpeed = -100;
const periodScaler = 1.7;
const minNote = 0.1;
const max_track = 10;

const scaleX = 100;
const scaleY = Math.round((height * scaleX) / width);

const mouseAttract = 1;
const imageAttract = 10;
const allignDelay = 10;

const thresholdPercent = 0.93

let dots = [];
let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;

let tracks = [];
let isPlaying = false;
let startTime = 0;
let endTime = 0;
let Tone = null;
let force_x = 0;
let force_y = 0;
let audioContext = null;

let isShowing = false;
let lastAllign = 0;
let imageDots = [];
let mouseX = 0;
let mouseY = 0;

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

        this.strength = 1 / Math.sqrt(this.notes.length)
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
            const frequency = this.notes[i].frequency;
            const time = startTime + this.notes[i].time;
            const duration = Math.max(this.notes[i].duration * 2, minNote);
            
            const osc = audioContext.createOscillator();
            osc.type = 'sine';
            
            const gain = audioContext.createGain();
            gain.gain.setValueAtTime(0.5, time);
            gain.gain.exponentialRampToValueAtTime(0.0000001, time + duration);
            
            osc.frequency.setValueAtTime(frequency, time);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.start(time);
            osc.stop(time + duration);
            
            endTime = Math.max(time + duration, endTime);
        }
    }
}

function createRandomDot() {
    const randomX = Math.random() * width;
    const randomY = Math.random() * height;
    const dot = new Dot(randomX, randomY, Math.random()**2);
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

document.addEventListener('mousemove', (event) => {
    mouseX = event.clientX
    mouseY = event.clientY
    const now = Date.now();
    if (!(now - lastMouseMove > mouseMoveDelay)) {
        return
    };
    lastMouseMove = now

    const targetX = mouseX - width / 2;
    const targetY = mouseY - height / 2;
    deltaPosition_x += (targetX - deltaPosition_x) * mouseSmooth;
    deltaPosition_y += (targetY - deltaPosition_y) * mouseSmooth;
})

async function playMidi() {
    const file = document.getElementById('midiInput').files[0] || await fetch('assets/midi/mozart_lacrimosa.mid').then(res => res.blob());
    const {Midi} = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/+esm');
    const arrayBuffer = await file.arrayBuffer();
    const midi = new Midi(arrayBuffer);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    isPlaying = true;
    document.querySelector('.content').remove();

    if (audioContext.state === 'suspended') await audioContext.resume();

    let position_index = 0;
    for (let i = 0; i < midi.tracks.length; i++) {
        if (i % 2) {
            x = Math.random() * width;
            y = Math.round(Math.random()) * height;
        } else {
            x = Math.round(Math.random()) * width;
            y = Math.random() * height;
        }
        const track = new Track(x, y, midi.tracks[i]);
        if (track.notes.length > 0) {
            tracks.push(track);
            console.log(`Track ${position_index}: x=${x}, y=${y}`);
            position_index++;
        }
        if (position_index >= max_track) break;
    }

    startTime = audioContext.currentTime;
    for (let track of tracks) track.play(startTime);
}

async function ImageView() {
    const file = document.getElementById('imageInput').files[0] || await fetch('assets/images/test_image.png').then(res => res.blob())
    const img = new Image()
    img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = scaleX
        canvas.height = scaleY
        const ctx = canvas.getContext('2d')
        ctx.filter = 'contrast(200%)'
        ctx.drawImage(img, 0, 0, scaleX, scaleY)

        const imageData = ctx.getImageData(0, 0, scaleX, scaleY)
        const data = imageData.data

        let pixelBrightness = []
        for (let y = 0; y < scaleY; y++) {
            for (let x = 0; x < scaleX; x++) {
                const i = (y * scaleX + x) * 4
                const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
                pixelBrightness.push({x, y, brightness})
            }
        }
        pixelBrightness.sort((a, b) => a.brightness - b.brightness)
        imageDots = pixelBrightness.slice(Math.floor(pixelBrightness.length * thresholdPercent))

        for (let k = 0; k < imageDots.length; k++) {
            const {x, y, brightness} = imageDots[k];
            dot = document.createElement('div');
            dot.style.position = 'absolute';
            dot.style.width = '10px';
            dot.style.height = '10px';
            dot.style.backgroundColor = 'red';
            dot.style.left = `${x * width / scaleX - 5}px`;
            dot.style.top = `${y * height / scaleY - 5}px`;
            document.body.appendChild(this.dot);
        }

        console.log("x", scaleX, ", y", scaleY)
        console.log("total: ", pixelBrightness.length, "of which", imageDots.length)
    }
    isShowing = true
    img.src = URL.createObjectURL(file)
    document.querySelector('.content').remove()
}

function animateDots() {
    if (isPlaying) {
        if (audioContext.currentTime > endTime) {
            audioContext.suspend();
            isPlaying = false;
            deltaPosition_x = Math.random() * 100;
            deltaPosition_y = Math.random() * 100;
        }
    
        const nowTime = audioContext.currentTime;
        for (let i = 0; i < dots.length; i++) {
            const dot = dots[i];
            force_x = 0;
            force_y = 0;
    
            for (let j = 0; j < tracks.length; j++) {
                const track = tracks[j];
                const period = track.getCurrentPeriod(nowTime);
                if (period != null) {
                    const term1 = (dot.posX - track.posX) * period;
                    const term2 = (dot.posY - track.posY) * period;
                    force_x += term1 * Math.sin(term1) * Math.sin(term2) * waveSpeed * Math.sin(nowTime) * track.strength;
                    force_y += term2 * Math.cos(term1) * Math.cos(term2) * waveSpeed * Math.cos(nowTime) * track.strength;
                }
            }
    
            for (let k = 0; k < dots.length; k++) {
                if (i === k) continue;
                const dotOther = dots[k];
                const dx = dot.posX - dotOther.posX;
                const dy = dot.posY - dotOther.posY;
                const distSq = Math.max(1, dx * dx + dy * dy);
                force_x += (dx / distSq) * dotAttract / Math.max(0.2, dot.scale);
                force_y += (dy / distSq) * dotAttract / Math.max(0.2, dot.scale);
            }
    
            dot.add_pos(force_x, force_y);
        }
    }    

    if (isShowing) {
        for (let i = 0; i < dots.length; i++) {
            const dot = dots[i];
            force_x = (dot.posX - mouseX) * mouseAttract;
            force_y = (dot.posY - mouseY) * mouseAttract;
    
            for (let j = 0; j < dots.length; j++) {
                if (i === j) continue;
                const dx = dot.posX - dots[j].posX;
                const dy = dot.posY - dots[j].posY;
                const distSq = Math.max(1, dx * dx + dy * dy);
                force_x += (dx / distSq) * dotAttract / Math.max(0.2, dot.scale);
                force_y += (dy / distSq) * dotAttract / Math.max(0.2, dot.scale);
            }
            
            let shortest_distance = 1000
            for (let k = 0; k < imageDots.length; k++) {
                const {x, y, brightness} = imageDots[k];
                const dx = dot.posX - (x * width / scaleX);
                const dy = dot.posY - (y * height / scaleY);
                const distSq = Math.max(1, dx * dx + dy * dy);
                force_x += (dx / distSq) * imageAttract;
                force_y += (dy / distSq) * imageAttract;
                Math.min(shortest_distance, distSq)
            }
            shortest_distance = shortest_distance / 1000
            dot.add_pos(force_x * shortest_distance, force_y * shortest_distance);
        }
    }

    if (!(isPlaying || isShowing)) {
        dots.forEach(
            dot => {dot.add_pos(deltaPosition_x * dot.scale * mouseSpeed, deltaPosition_y * dot.scale * mouseSpeed)
        });
    }

    requestAnimationFrame(animateDots);
}

//run
loadDotsFromStorage();
animateDots();