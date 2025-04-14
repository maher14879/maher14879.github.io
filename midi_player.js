// play frequency
function playFrequency(frequency, duration) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.connect(audioContext.destination);
    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
        audioContext.close();
    }, duration);
}

// play note
function playNote(note, duration) {
    const noteFrequencies = {
        'C4': 261.63,
        'D4': 293.66,
        'E4': 329.63,
        'F4': 349.23,
        'G4': 392.00,
        'A4': 440.00,
        'B4': 493.88,
        'C5': 523.25
    };
    const frequency = noteFrequencies[note];
    if (frequency) {
        playFrequency(frequency, duration);
    } else {
        console.error('Note not found:', note);
    }
}

// play melody
function playMelody(melody, duration) {
    melody.forEach((note, index) => {
        setTimeout(() => {
            playNote(note, duration);
        }, index * duration);
    });
}