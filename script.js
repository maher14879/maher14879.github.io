let height = window.innerHeight - 10;
let width = window.innerWidth - 10;

const mouseMoveDelay = 30;
const mouseSmooth = 0.01;
const mouseSpeed = 0.05;
const dotsCount = 300;

const dotAttract = -0.7;   // reduced so cell repulsion has less visual effect
const waveSpeed = 30;       // lower = flow follows waves more, less pull to corners
const periodScaler = 1;
const minNote = 0.1;
const maxTrack = 10;
const flowDistanceFalloff = 0.008;  // soften force at large distance so dots don't rush to corners
const repulsionMix = 0.25;         // how much cell repulsion affects motion (0–1)

let deltaPosition_x = 0;
let deltaPosition_y = 0;
let lastMouseMove = 0;
let mouseX = 0;
let mouseY = 0;

let tracks = [];
let isPlaying = false;
let startTime = 0;
let endTime = 0;
let audioContext = null;

// --- Canvas rendering (replaces per-dot DOM elements) ---

const dotsCanvas = document.createElement('canvas');
dotsCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:-9999';
document.body.appendChild(dotsCanvas);
const dotsCtx = dotsCanvas.getContext('2d');

function resizeCanvas() {
    dotsCanvas.width = window.innerWidth;
    dotsCanvas.height = window.innerHeight;
}
resizeCanvas();

window.addEventListener('resize', () => {
    height = window.innerHeight - 10;
    width = window.innerWidth - 10;
    resizeCanvas();
});

// --- Dot data: Structure-of-Arrays with typed arrays ---

const dotX = new Float64Array(dotsCount);
const dotY = new Float64Array(dotsCount);
const dotScale = new Float32Array(dotsCount);
let dotCount = 0;

function addDot(x, y, s) {
    dotX[dotCount] = x;
    dotY[dotCount] = y;
    dotScale[dotCount] = s;
    dotCount++;
}

function wrapDot(i) {
    if (dotX[i] >= width) dotX[i] = 1;
    else if (dotX[i] <= 0) dotX[i] = width - 1;
    if (dotY[i] >= height) dotY[i] = 1;
    else if (dotY[i] <= 0) dotY[i] = height - 1;
}

// --- Pre-rendered glow sprites (one per scale bucket) ---

const SPRITE_LEVELS = 32;
const sprites = [];

(function initSprites() {
    for (let i = 0; i < SPRITE_LEVELS; i++) {
        const s = i / (SPRITE_LEVELS - 1);
        const dotSize = s * 3 + 1;
        const glowRadius = s * 2 + 1;
        const padding = Math.max(glowRadius * 4, 8);
        const size = Math.ceil(dotSize + padding * 2);

        const oc = document.createElement('canvas');
        oc.width = size;
        oc.height = size;
        const octx = oc.getContext('2d');

        const bright = Math.min(255, Math.round(255 * (s / 3 + 0.1)));
        octx.shadowColor = `rgb(${bright},${bright},${bright})`;
        octx.shadowBlur = glowRadius;
        octx.fillStyle = 'white';

        const offset = (size - dotSize) / 2;
        octx.fillRect(offset, offset, dotSize, dotSize);
        octx.fillRect(offset, offset, dotSize, dotSize);

        sprites.push({ img: oc, half: size / 2 });
    }
})();

function getSpriteIdx(s) {
    return Math.round(Math.min(s, 1) * (SPRITE_LEVELS - 1));
}

// --- Spatial grid for neighbor queries ---

const CELL_SIZE = 200;
let gridCols = 0;
let gridRows = 0;
let grid = [];

function buildGrid() {
    gridCols = Math.max(1, Math.ceil(width / CELL_SIZE) + 1);
    gridRows = Math.max(1, Math.ceil(height / CELL_SIZE) + 1);
    const total = gridCols * gridRows;
    while (grid.length < total) grid.push([]);
    for (let i = 0; i < total; i++) grid[i].length = 0;

    for (let i = 0; i < dotCount; i++) {
        const col = Math.max(0, Math.min((dotX[i] / CELL_SIZE) | 0, gridCols - 1));
        const row = Math.max(0, Math.min((dotY[i] / CELL_SIZE) | 0, gridRows - 1));
        grid[row * gridCols + col].push(i);
    }
}

let repX = 0, repY = 0;

function computeRepulsion(i) {
    const px = dotX[i], py = dotY[i];
    const attract = dotAttract / Math.max(0.2, dotScale[i]);
    const col = Math.max(0, Math.min((px / CELL_SIZE) | 0, gridCols - 1));
    const row = Math.max(0, Math.min((py / CELL_SIZE) | 0, gridRows - 1));
    const rMin = Math.max(0, row - 1), rMax = Math.min(gridRows - 1, row + 1);
    const cMin = Math.max(0, col - 1), cMax = Math.min(gridCols - 1, col + 1);

    let fx = 0, fy = 0;
    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            const cell = grid[r * gridCols + c];
            for (let k = 0, len = cell.length; k < len; k++) {
                const j = cell[k];
                if (j === i) continue;
                const dx = px - dotX[j];
                const dy = py - dotY[j];
                const distSq = Math.max(1, dx * dx + dy * dy);
                fx += (dx / distSq) * attract;
                fy += (dy / distSq) * attract;
            }
        }
    }
    repX = fx;
    repY = fy;
}

// --- Note & Track ---

class Note {
    constructor(frequency, time, duration) {
        this.frequency = frequency;
        this.time = time;
        this.duration = duration;
        this.activeEnd = time + duration * 2 / 3;
    }
}

class Track {
    constructor(posX, posY, midiTrack) {
        this.posX = posX;
        this.posY = posY;
        this._cursor = 0;
        this.notes = midiTrack.notes
            .map(n => new Note(440 * Math.pow(2, (n.midi - 69) / 12), n.time, n.duration))
            .sort((a, b) => a.time - b.time);
    }

    getCurrentPeriod(nowTime) {
        const notes = this.notes;
        while (this._cursor < notes.length && notes[this._cursor].activeEnd < nowTime) {
            this._cursor++;
        }
        for (let i = this._cursor; i < notes.length; i++) {
            if (notes[i].time > nowTime) break;
            if (nowTime <= notes[i].activeEnd) {
                return periodScaler / notes[i].frequency;
            }
        }
        return null;
    }

    play(audioStart, destination) {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.connect(destination || audioContext.destination);

        const voiceGain = 0.14;   // lower per-voice gain to avoid clipping when many notes
        const rampIn = 0.015;    // short fade-in to avoid clicks

        for (const note of this.notes) {
            const time = audioStart + note.time;
            const duration = Math.max(note.duration * 2, minNote);

            const osc = audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(note.frequency, time);

            const gain = audioContext.createGain();
            gain.gain.setValueAtTime(0.00001, time);
            gain.gain.exponentialRampToValueAtTime(voiceGain, time + rampIn);
            gain.gain.exponentialRampToValueAtTime(0.00001, time + duration);

            osc.connect(gain);
            gain.connect(filter);
            osc.start(time);
            osc.stop(time + duration);

            endTime = Math.max(time + duration, endTime);
        }
    }
}

// --- Dot persistence ---

function createRandomDot() {
    addDot(Math.random() * width, Math.random() * height, Math.random() ** 2);
}

function saveDotsToStorage() {
    const data = [];
    for (let i = 0; i < dotCount; i++) {
        data.push({ x: dotX[i], y: dotY[i], scale: dotScale[i] });
    }
    localStorage.setItem('dots', JSON.stringify(data));
    localStorage.setItem('deltaPosition', JSON.stringify({ x: deltaPosition_x, y: deltaPosition_y }));
}

function loadDotsFromStorage() {
    const stored = JSON.parse(localStorage.getItem('dots') || '[]');
    for (const d of stored) {
        if (dotCount >= dotsCount) break;
        addDot(d.x, d.y, d.scale);
    }
    while (dotCount < dotsCount) createRandomDot();

    const delta = JSON.parse(localStorage.getItem('deltaPosition') || '{"x":0,"y":0}');
    deltaPosition_x = delta.x;
    deltaPosition_y = delta.y;
}

window.addEventListener('beforeunload', saveDotsToStorage);

// --- Mouse input ---

document.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    const now = Date.now();
    if (now - lastMouseMove <= mouseMoveDelay) return;
    lastMouseMove = now;

    deltaPosition_x += (mouseX - width / 2 - deltaPosition_x) * mouseSmooth;
    deltaPosition_y += (mouseY - height / 2 - deltaPosition_y) * mouseSmooth;
});

// --- MIDI playback ---

async function playMidi() {
    const file = document.getElementById('midiInput').files[0]
        || await fetch('assets/midi/mozart_lacrimosa.mid').then(r => r.blob());
    const { Midi } = await import('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/+esm');
    const midi = new Midi(await file.arrayBuffer());
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    isPlaying = true;
    document.querySelector('.content').remove();
    if (audioContext.state === 'suspended') await audioContext.resume();

    let idx = 0;
    for (let i = 0; i < midi.tracks.length && idx < maxTrack; i++) {
        let x, y;
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
            idx++;
        }
    }

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 20;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.connect(audioContext.destination);

    startTime = audioContext.currentTime;
    for (const track of tracks) track.play(startTime, compressor);
}

// --- Rendering ---

function render() {
    dotsCtx.clearRect(0, 0, dotsCanvas.width, dotsCanvas.height);
    for (let i = 0; i < dotCount; i++) {
        const sp = sprites[getSpriteIdx(dotScale[i])];
        dotsCtx.drawImage(sp.img, dotX[i] + 5 - sp.half, dotY[i] + 5 - sp.half);
    }
}

// --- Animation loop ---

function animateDots() {
    if (isPlaying) {
        if (audioContext.currentTime > endTime) {
            audioContext.suspend();
            isPlaying = false;
            deltaPosition_x = Math.random() * 100;
            deltaPosition_y = Math.random() * 100;
        } else {
            buildGrid();
            const nowTime = audioContext.currentTime - startTime;
            const sinNow = Math.sin(nowTime);
            const cosNow = Math.cos(nowTime);

            const periods = new Array(tracks.length);
            for (let j = 0; j < tracks.length; j++) {
                periods[j] = tracks[j].getCurrentPeriod(nowTime);
            }

            for (let i = 0; i < dotCount; i++) {
                let fx = 0, fy = 0;

                for (let j = 0; j < tracks.length; j++) {
                    if (periods[j] !== null) {
                        const dx = dotX[i] - tracks[j].posX;
                        const dy = dotY[i] - tracks[j].posY;
                        const T = periods[j];
                        const t1 = dx * T;  // Δx·T
                        const t2 = dy * T;  // Δy·T
                        // Formula: ∇f_x = Δx·T·sin(Δx·T)·sin(Δy·T)·sin(t)·s, ∇f_y = Δy·T·cos(Δy·T)·cos(Δx·T)·cos(t)·s
                        const gx = t1 * Math.sin(t1) * Math.sin(t2) * waveSpeed * sinNow;
                        const gy = t2 * Math.cos(t2) * Math.cos(t1) * waveSpeed * cosNow;
                        // Distance falloff: softer force far from source so flow follows waves, not corners
                        const falloff = 1 / (1 + flowDistanceFalloff * (t1 * t1 + t2 * t2));
                        fx += gx * falloff;
                        fy += gy * falloff;
                    }
                }

                computeRepulsion(i);
                fx += repX * repulsionMix;
                fy += repY * repulsionMix;

                dotX[i] -= fx;
                dotY[i] -= fy;
                wrapDot(i);
            }
        }
    }

    if (!isPlaying) {
        for (let i = 0; i < dotCount; i++) {
            dotX[i] -= deltaPosition_x * dotScale[i] * mouseSpeed;
            dotY[i] -= deltaPosition_y * dotScale[i] * mouseSpeed;
            wrapDot(i);
        }
    }

    render();
    requestAnimationFrame(animateDots);
}

// --- Run ---
loadDotsFromStorage();
animateDots();
