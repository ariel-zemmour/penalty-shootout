const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const UI = {
    scoreP1: document.getElementById('score-p1'),
    scoreP2: document.getElementById('score-p2'),
    timer: document.getElementById('timer'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlaySubtitle: document.getElementById('overlay-subtitle'),
    rematchBtn: document.getElementById('rematch-btn')
};

// Game Constants
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const FPS = 60;
const PITCH_COLOR = '#1a4a28';
const PITCH_STRIPE = '#1e5630';
const LINE_COLOR = 'rgba(255, 255, 255, 0.7)';
const GOAL_WIDTH = 150;
const GOAL_DEPTH = 50;

// Game State
let gameState = 'START'; // START, PLAYING, GOAL, GAMEOVER
let score1 = 0;
let score2 = 0;
let matchTime = 180; // 3 minutes in seconds
let lastTime = 0;
let timerAccumulator = 0;
let animationFrameId;

// Input Handling - Multiple keys handled simultaneously
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Math utilities
function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Entities
class Player {
    constructor(x, y, radius, color, side) {
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.side = side; // 1 (Blue/Left) or 2 (Red/Right)
        this.vx = 0;
        this.vy = 0;
        this.speed = 4;
        this.kickPower = 12;
        this.mass = 2;
        this.kickCooldown = false;
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
    }

    update(controls) {
        if (gameState !== 'PLAYING') return;

        let dx = 0;
        let dy = 0;

        if (keys[controls.up]) dy -= 1;
        if (keys[controls.down]) dy += 1;
        if (keys[controls.left]) dx -= 1;
        if (keys[controls.right]) dx += 1;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const mag = Math.sqrt(dx * dx + dy * dy);
            dx /= mag;
            dy /= mag;
        }

        this.vx = dx * this.speed;
        this.vy = dy * this.speed;

        this.x += this.vx;
        this.y += this.vy;

        // Constrain to pitch so players don't go out of bounds
        this.x = Math.max(this.radius, Math.min(WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(HEIGHT - this.radius, this.y));

        // Kicking mechanic logic
        if (keys[controls.kick] && !this.kickCooldown) {
            this.kickCooldown = true;
            this.kick();
            setTimeout(() => { this.kickCooldown = false; }, 300); // 300ms cooldown to prevent spamming
        }
    }

    kick() {
        const dist = distance(this, ball);
        if (dist < this.radius + ball.radius + 15) { // Can kick if nearby
            // Kick direction from player center to ball center
            let kx = ball.x - this.x;
            let ky = ball.y - this.y;
            const mag = Math.sqrt(kx * kx + ky * ky);
            if(mag > 0) {
                kx /= mag;
                ky /= mag;
                
                // Extra kick power logic
                ball.vx += kx * this.kickPower;
                ball.vy += ky * this.kickPower;
            }
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Gradient for simple 3D effect
        let gradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3, 
            this.y - this.radius * 0.3, 
            this.radius * 0.1, 
            this.x, 
            this.y, 
            this.radius
        );
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.2, this.color);
        gradient.addColorStop(1, '#000');
        
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.closePath();

        // Direction indicator circle (looks pretty)
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
    }
}

class Ball {
    constructor(x, y, radius) {
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.vx = 0;
        this.vy = 0;
        this.friction = 0.97; // Ball slowing down
        this.mass = 1;
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
    }

    update() {
        if (gameState !== 'PLAYING') return;

        this.vx *= this.friction;
        this.vy *= this.friction;

        // Stop completely if very slow (jitter fix)
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        if (Math.abs(this.vy) < 0.1) this.vy = 0;

        this.x += this.vx;
        this.y += this.vy;

        // Are we within the Y boundaries of the goal mouths?
        const inGoalY = this.y > HEIGHT / 2 - GOAL_WIDTH / 2 && this.y < HEIGHT / 2 + GOAL_WIDTH / 2;

        // Bounce off top and bottom screen edges
        if (this.y - this.radius <= 0) {
            this.y = this.radius;
            this.vy *= -1;
        } else if (this.y + this.radius >= HEIGHT) {
            this.y = HEIGHT - this.radius;
            this.vy *= -1;
        }

        // Left boundary
        if (this.x - this.radius <= 0) {
            if (inGoalY) {
                // Ball entered Left Goal (Red Team Scores)
                if (this.x < -this.radius && gameState === 'PLAYING') {
                    scoreGoal(2);
                }
            } else {
                // Bounce off left wall
                this.x = this.radius;
                this.vx *= -1;
            }
        } 
        // Right boundary
        else if (this.x + this.radius >= WIDTH) {
            if (inGoalY) {
                // Ball entered Right Goal (Blue Team Scores)
                if (this.x > WIDTH + this.radius && gameState === 'PLAYING') {
                    scoreGoal(1);
                }
            } else {
                // Bounce off right wall
                this.x = WIDTH - this.radius;
                this.vx *= -1;
            }
        }
        
        // Basic physics to check goal post collision so ball bounces out properly
        this.checkGoalPostCollision(0, HEIGHT/2 - GOAL_WIDTH/2);
        this.checkGoalPostCollision(0, HEIGHT/2 + GOAL_WIDTH/2);
        this.checkGoalPostCollision(WIDTH, HEIGHT/2 - GOAL_WIDTH/2);
        this.checkGoalPostCollision(WIDTH, HEIGHT/2 + GOAL_WIDTH/2);
    }
    
    checkGoalPostCollision(px, py) {
        const dx = this.x - px;
        const dy = this.y - py;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const postRadius = 5;
        if (dist < this.radius + postRadius) {
            const nx = dx / dist;
            const ny = dy / dist;
            
            // Push out of post
            const overlap = (this.radius + postRadius) - dist;
            this.x += nx * overlap;
            this.y += ny * overlap;
            
            // Reflect velocity over normal
            const dotProduct = this.vx * nx + this.vy * ny;
            this.vx -= 2 * dotProduct * nx * 0.8; // Dampened
            this.vy -= 2 * dotProduct * ny * 0.8;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();
        ctx.closePath();

        // Hexagon-ish center dot for flair
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.closePath();
    }
}

// 2D Circle Collision (Player vs Player and Player vs Ball)
function resolveCollision(entityA, entityB) {
    const dx = entityB.x - entityA.x;
    const dy = entityB.y - entityA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < entityA.radius + entityB.radius) {
        // Find normal
        const nx = dx / dist;
        const ny = dy / dist;

        // Penetration logic to keep them from overlapping
        const overlap = (entityA.radius + entityB.radius) - dist;
        
        entityB.x += nx * overlap * 0.5;
        entityB.y += ny * overlap * 0.5;
        entityA.x -= nx * overlap * 0.5;
        entityA.y -= ny * overlap * 0.5;

        // Elastic Collision response
        const rvx = entityB.vx - entityA.vx;
        const rvy = entityB.vy - entityA.vy;
        
        // Velocity along the normal
        const velAlongNormal = rvx * nx + rvy * ny;
        
        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) return;
        
        // Restitution (bounciness)
        const restitution = 0.6;
        
        // Impulse scalar
        let j = -(1 + restitution) * velAlongNormal;
        j /= (1 / entityA.mass + 1 / entityB.mass);
        
        const impulseX = j * nx;
        const impulseY = j * ny;
        
        entityA.vx -= impulseX / entityA.mass;
        entityA.vy -= impulseY / entityA.mass;
        entityB.vx += impulseX / entityB.mass;
        entityB.vy += impulseY / entityB.mass;
    }
}

// Controls configuration
const p1Controls = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', kick: 'Space' };
const p2Controls = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', kick: 'Enter' };

// Create instances
const player1 = new Player(WIDTH / 4, HEIGHT / 2, 22, '#2e8af6', 1);
const player2 = new Player(WIDTH * 3 / 4, HEIGHT / 2, 22, '#f62e4a', 2);
const ball = new Ball(WIDTH / 2, HEIGHT / 2, 14);

// Environment Rendering
function drawPitch() {
    // Dynamic pitch mowing pattern (stripes)
    const stripeWidth = 50;
    for (let i = 0; i < WIDTH; i += stripeWidth * 2) {
        ctx.fillStyle = PITCH_COLOR;
        ctx.fillRect(i, 0, stripeWidth, HEIGHT);
        ctx.fillStyle = PITCH_STRIPE;
        ctx.fillRect(i + stripeWidth, 0, stripeWidth, HEIGHT);
    }

    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 4;

    // Outer Pitch bounds
    ctx.strokeRect(0, 0, WIDTH, HEIGHT);

    // Halfway vertical line
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 0);
    ctx.lineTo(WIDTH / 2, HEIGHT);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(WIDTH / 2, HEIGHT / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = LINE_COLOR;
    ctx.fill();

    // Penalty box areas
    const boxDepth = 150;
    const boxWidth = 300;
    ctx.strokeRect(0, HEIGHT / 2 - boxWidth / 2, boxDepth, boxWidth);
    ctx.strokeRect(WIDTH - boxDepth, HEIGHT / 2 - boxWidth / 2, boxDepth, boxWidth);

    // Goal Nets
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-GOAL_DEPTH, HEIGHT / 2 - GOAL_WIDTH / 2, GOAL_DEPTH, GOAL_WIDTH);
    ctx.fillRect(WIDTH, HEIGHT / 2 - GOAL_WIDTH / 2, GOAL_DEPTH, GOAL_WIDTH);

    ctx.strokeStyle = '#dedede';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, HEIGHT / 2 - GOAL_WIDTH / 2, -GOAL_DEPTH, GOAL_WIDTH);
    ctx.strokeRect(WIDTH, HEIGHT / 2 - GOAL_WIDTH / 2, GOAL_DEPTH, GOAL_WIDTH);
}

// Game Rules & State Logic
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updateHUD() {
    UI.scoreP1.innerText = `PLAYER 1: ${score1}`;
    UI.scoreP2.innerText = `PLAYER 2: ${score2}`;
    UI.timer.innerText = formatTime(matchTime);
    
    if (matchTime <= 10 && gameState === 'PLAYING') {
        UI.timer.style.color = '#f62e4a';
    } else {
        UI.timer.style.color = 'white';
    }
}

function resetPositions() {
    player1.reset();
    player2.reset();
    ball.reset();
}

function scoreGoal(playerScored) {
    gameState = 'GOAL';
    if (playerScored === 1) {
        score1++;
        UI.overlayTitle.style.color = 'var(--p1-color)';
    } else {
        score2++;
        UI.overlayTitle.style.color = 'var(--p2-color)';
    }
    updateHUD();
    
    UI.overlayTitle.innerText = 'GOAL!';
    UI.overlaySubtitle.innerText = `Player ${playerScored} scores!`;
    UI.overlay.classList.remove('hidden');

    setTimeout(() => {
        if(gameState === 'GOAL') {
            resetPositions();
            UI.overlay.classList.add('hidden');
            gameState = 'PLAYING';
        }
    }, 2000);
}

function endGame() {
    gameState = 'GAMEOVER';
    UI.overlay.classList.remove('hidden');
    UI.rematchBtn.classList.remove('hidden');
    
    if (score1 > score2) {
        UI.overlayTitle.innerText = 'PLAYER 1 WINS!';
        UI.overlayTitle.style.color = 'var(--p1-color)';
    } else if (score2 > score1) {
        UI.overlayTitle.innerText = 'PLAYER 2 WINS!';
        UI.overlayTitle.style.color = 'var(--p2-color)';
    } else {
        UI.overlayTitle.innerText = 'DRAW!';
        UI.overlayTitle.style.color = '#fff';
    }
    
    UI.overlaySubtitle.innerText = `Final Score: ${score1} - ${score2}`;
}

UI.rematchBtn.addEventListener('click', () => {
    score1 = 0;
    score2 = 0;
    matchTime = 180;
    resetPositions();
    updateHUD();
    
    UI.overlay.classList.add('hidden');
    UI.rematchBtn.classList.add('hidden');
    
    gameState = 'PLAYING';
});

// The Game Loop
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Environment
    drawPitch();

    // State Logic
    if (gameState === 'PLAYING') {
        timerAccumulator += dt;
        if (timerAccumulator >= 1) {
            matchTime--;
            timerAccumulator -= 1;
            updateHUD();
            
            if (matchTime <= 0) {
                endGame();
            }
        }

        player1.update(p1Controls);
        player2.update(p2Controls);
        ball.update();

        // Object Collisions
        resolveCollision(player1, player2);
        resolveCollision(player1, ball);
        resolveCollision(player2, ball);
    }
    
    // Draw Dynamic Entities
    player1.draw();
    player2.draw();
    ball.draw();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// Initial Setup
updateHUD();
UI.overlayTitle.innerText = 'ARCADE SOCCER';
UI.overlaySubtitle.innerText = 'Press ANY KEY to Start';
UI.overlayTitle.style.color = '#fff';
UI.overlay.classList.remove('hidden');

// Hook to start game
window.addEventListener('keydown', function startGame(e) {
    if (gameState === 'START') {
        gameState = 'PLAYING';
        UI.overlay.classList.add('hidden');
        window.removeEventListener('keydown', startGame);
    }
});

requestAnimationFrame(gameLoop);
