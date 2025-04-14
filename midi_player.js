class Note {
    constructor(frequency, volume) {
        this.frequency = frequency
        this.volume = volume
    }
}

class Notes {
    constructor(notes) {
        this.notes = notes
        this.index = 0
    }

    deque() {
        if (this.index >= this.notes.length) return
        const note = this.notes[this.index]
        this.index += 1
        return note
    }
}

class Channel {
    constructor(name, notes, note_duration) {
        this.name = name
        this.notes = notes
        this.note_duration = note_duration
        this.current_note = null
        this.time = 0
        this.ctx = new AudioContext()
    }

    playNote(note) {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.frequency.value = note.frequency
        gain.gain.value = note.volume
        osc.connect(gain)
        gain.connect(this.ctx.destination)
        osc.start()
        osc.stop(this.ctx.currentTime + this.note_duration)
    }

    run(dt) {
        this.time += dt
        if (this.time > this.note_duration) {
            this.time -= this.note_duration
            this.current_note = this.notes.deque()
            if (this.current_note) this.playNote(this.current_note)
        }
    }
}

class Synthesizer {
    constructor(midi_file, note_duration) {
        this.quaver_length = midi_file.bar_length / 8;
        this.notes_per_bar = {};

        midi_file.tracks.forEach(track => {
            track.notes.forEach(note => {
                this.appendNote(note);
            });
        });

        this.notes_dict = {};
        let channel_num_max = 0;

        for (let bar in this.notes_per_bar) {
            const notes = this.notes_per_bar[bar];
            channel_num_max = Math.max(notes.length, channel_num_max);
            for (let channel_num = 0; channel_num < channel_num_max; channel_num++) {
                const note = notes[channel_num] || null;
                const frequency = note ? note.frequency : 0;
                const volume = note ? note.volume : 0;

                if (!this.notes_dict[channel_num]) {
                    this.notes_dict[channel_num] = [];
                }

                this.notes_dict[channel_num].push(new Note(frequency, volume));
            }
        }

        this.channels = [];
        for (let channel_num = 0; channel_num < channel_num_max; channel_num++) {
            const notes = this.notes_dict[channel_num];
            this.channels.push(new Channel(channel_num, new Notes(notes), note_duration));
        }

        this.quaver_length = null;
        this.notes_per_bar = null;
        this.notes_dict = null;
    }

    appendNote(note) {
        if (note.duration > this.quaver_length) {
            const next_note = note.extend(this.quaver_length);
            this.appendNote(next_note);
        }

        const bar = Math.floor(note.time / this.quaver_length);
        if (!this.notes_per_bar[bar]) {
            this.notes_per_bar[bar] = [];
        }
        this.notes_per_bar[bar].push(note);
    }

    run(dt) {
        this.channels.forEach(channel => {
            channel.run(dt);
        });
    }
}


//new
<script src="https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.27/build/Midi.min.js"></script>

let synth, lastTime

function handleMidiUpload(file) {
    const reader = new FileReader()
    reader.onload = () => {
        const midiData = parseMidi(reader.result)
        synth = new Synthesizer(midiData, 0.2)
    }
    reader.readAsArrayBuffer(file)
}

function loop(t) {
    if (!lastTime) lastTime = t
    const dt = (t - lastTime) / 1000
    lastTime = t
    if (synth) synth.run(dt)
    requestAnimationFrame(loop)
}

window.addEventListener('mousemove', () => {
    if (!lastTime) requestAnimationFrame(loop)
}, { once: true })