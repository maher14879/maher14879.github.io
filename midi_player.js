document.getElementById('playButton').addEventListener('click', function() {
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create oscillator (sound source)
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';  // Type of waveform (sine, square, sawtooth, triangle)
    oscillator.frequency.value = 440;  // Frequency in Hz (A4 note)
    
    // Connect oscillator to output
    oscillator.connect(audioContext.destination);
    
    // Start the oscillator and stop it after 1 second
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1);
});