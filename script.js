const jump = 5;

class MovingDot {
    constructor() {
        this.scale = Math.random()
        this.dot = document.createElement('div');
        this.dot.style.position = 'absolute';
        this.dot.style.width = `${this.scale * 20}px`;
        this.dot.style.height = `${this.scale * 20}px`;
        this.dot.style.backgroundColor = 'white';
        this.dot.style.borderRadius = '50%';
        this.dot.style.pointerEvents = 'none';
        document.body.appendChild(this.dot);
        this.dotX = (1 - Math.random()) * window.innerWidth;
        this.dotY = (1 - Math.random()) * window.innerHeight;

        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;

        this.lastMouseX = this.mouseX;
        this.lastMouseY = this.mouseY;

        this.deltaMouse = { x: 0, y: 0 };

        this.updateDotPosition();
    }

    updateDotPosition() {
        if (this.deltaMouse.x !== 0 || this.deltaMouse.y !== 0) {
            this.dotX += this.deltaMouse.x * this.scale;
            this.dotY += this.deltaMouse.y * this.scale;
        }

        this.dot.style.left = `${this.dotX - this.dot.offsetWidth / 2}px`;
        this.dot.style.top = `${this.dotY - this.dot.offsetHeight / 2}px`;

        requestAnimationFrame(this.updateDotPosition.bind(this));
    }

    setMousePosition(x, y) {
        const deltaX = x - this.lastMouseX;
        const deltaY = y - this.lastMouseY;
        const distance = Math.hypot(deltaX, deltaY);
        
        if (distance < jump) {
            const factor = distance === 0 ? 0 : jump / distance;
            this.deltaMouse.x = deltaX * factor;
            this.deltaMouse.y = deltaY * factor;
        }
    
        this.lastMouseX = x;
        this.lastMouseY = y;
    }
}

const dots = [];
for (let i = 0; i < 5; i++) {
    dots.push(new MovingDot());
}

document.addEventListener('mousemove', (e) => {
    dots.forEach(dot => {
        dot.setMousePosition(e.clientX, e.clientY);
    });
});

