(function() {
    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.width = '20px';
    dot.style.height = '20px';
    dot.style.backgroundColor = 'white';
    dot.style.borderRadius = '50%';
    dot.style.pointerEvents = 'none';
    document.body.appendChild(dot);

    let dotX = (1 - Math.random()) * window.innerWidth;
    let dotY = (1 - Math.random()) * window.innerHeight;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    const speed = 0.0005;  // Adjust speed of movement

    function updateDotPosition() {
        const dx = mouseX - dotX;
        const dy = mouseY - dotY;

        dotX += dx * speed;
        dotY += dy * speed;

        dot.style.left = `${dotX - dot.offsetWidth / 2}px`;
        dot.style.top = `${dotY - dot.offsetHeight / 2}px`;

        requestAnimationFrame(updateDotPosition);
    }

    // Update mouse position
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Start the animation loop
    updateDotPosition();
})();
