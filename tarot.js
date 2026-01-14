const CARD_CONFIG = {
    moveLerp: 1,
    windResponse: 10,
    windRotMax: 5,
    windSpeedNorm: 10,
    fragmentCount: 5,
    fragmentSpeed: 300,
    fragmentGravity: 1000,
    fragmentSpin: 1,
    flipSpeed: 8,
    flip3DDepth: 0.3,
    flipLift: 15
}

class Card {
    constructor(frontImage, backImage, fragmentImage, position, cfg = CARD_CONFIG) {
        this.frontImage = frontImage
        this.backImage = backImage
        this.fragmentImage = fragmentImage
        this.cfg = cfg

        this.position = { x: position.x, y: position.y }
        this.target = { x: position.x, y: position.y }

        this.currentImage = backImage

        this.scale = 1
        this.rotation = 0
        this.wind = 0

        this.broken = false
        this.fragments = []

        this.flipping = false
        this.flipAngle = 0
        this.flipSwapped = false
    }

    flip() {
        if (this.broken) return
        if (this.flipping) return
        this.flipping = true
        this.flipAngle = 0
        this.flipSwapped = false
    }

    break() {
        const { fragmentCount, fragmentSpeed } = this.cfg
        this.broken = true
        this.fragments = []
        for (let i = 0; i < fragmentCount; i++) {
            const ang = Math.random() * Math.PI * 2
            const spd = (Math.random() - 0.5) * fragmentSpeed * 2
            this.fragments.push({
                x: 0,
                y: 0,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                r: Math.random() * Math.PI,
            })
        }
    }

    reset(position) {
        this.position = { x: position.x, y: position.y }
        this.target = { x: position.x, y: position.y }
        this.currentImage = this.backImage

        this.scale = 1
        this.rotation = 0
        this.wind = 0

        this.broken = false
        this.fragments = []

        this.flipping = false
        this.flipAngle = 0
        this.flipSwapped = false
    }

    update(dt) {
        if (this.broken) {
            const { fragmentGravity, fragmentSpin } = this.cfg
            this.fragments.forEach(f => {
                f.x += f.vx * dt
                f.y += f.vy * dt
                f.vy += fragmentGravity * dt
                f.r += fragmentSpin * dt
            })
            return
        }

        const { moveLerp, windSpeedNorm, windResponse, windRotMax } = this.cfg
        const px = this.position.x
        const py = this.position.y

        const dx = this.target.x - px
        const dy = this.target.y - py
        this.position.x += dx * moveLerp * dt
        this.position.y += dy * moveLerp * dt

        const mvx = this.position.x - px
        const speedLeft = Math.max(0, -mvx)
        const speedMag = Math.hypot(this.position.x - px, this.position.y - py)
        const windTarget = Math.max(0, Math.min(1, (speedLeft + speedMag) / windSpeedNorm))
        const hold = 0.96
        this.wind = Math.max(this.wind * hold, this.wind + (windTarget - this.wind) * windResponse * dt)
        this.rotation += ((this.wind * windRotMax) - this.rotation) * dt

        if (this.flipping) {
            this.flipAngle += this.cfg.flipSpeed * dt
            if (!this.flipSwapped && this.flipAngle >= Math.PI / 2) {
                this.flipSwapped = true
                this.currentImage = this.currentImage === this.frontImage ? this.backImage : this.frontImage
            }
            if (this.flipAngle >= Math.PI) {
                this.flipping = false
                this.flipAngle = 0
                this.flipSwapped = false
            }
        }
    }

    draw(ctx) {
        const sx = this.position.x * ctx.canvas.width / 100
        const sy = this.position.y * ctx.canvas.height / 100

        ctx.save()
        ctx.translate(sx, sy)

        if (this.broken) {
            const baseW = this.fragmentImage.width
            const baseH = this.fragmentImage.height
            this.fragments.forEach(f => {
                ctx.save()
                ctx.translate(f.x, f.y)
                ctx.rotate(f.r)
                const w = baseW
                const h = baseH
                ctx.drawImage(this.fragmentImage, -w / 2, -h / 2, w, h)
                ctx.restore()
            })
        } else {
            const a = this.flipAngle
            const flipSkew = this.flipping ? Math.sin(a) * this.cfg.flip3DDepth : 0
            const lift = this.flipping ? Math.sin(a) * this.cfg.flipLift : 0
            const scaleX = this.flipping ? Math.max(Math.abs(Math.cos(a)), 0.001) : 1

            ctx.translate(0, -lift)
            ctx.rotate(this.rotation)
            ctx.transform(1, 0, flipSkew, 1, 0, 0)
            ctx.scale(scaleX, 1)
            ctx.drawImage(this.currentImage, -this.currentImage.width / 2, -this.currentImage.height / 2)
        }

        ctx.restore()
    }
}

class Game {
    constructor() {
        this.cards = {}
        this.backImg = null
        this.placedCards = []
        this.addedCards = []
        this.removedCards = []
        this.center = { x: 50, y: 50 }
        this.radius = 30
        this.deckLocation = { x: 50, y: -20 }
        this.distanceThreshold = 10
        this.maxAddedCards = 9
        this.rotationSpeed = -0.2
        this.rotation = 0.0
        this.sounds = {}
    }

    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = reject
            img.src = path
        })
    }

    loadAudio(src) {
        return new Promise((resolve, reject) => {
            const a = new Audio()
            a.preload = 'auto'
            a.src = src
            const ready = () => { cleanup(); resolve(a) }
            const fail = e => { cleanup(); reject(e) }
            const cleanup = () => {
                a.removeEventListener('canplaythrough', ready)
                a.removeEventListener('loadeddata', ready)
                a.removeEventListener('error', fail)
            }
            a.addEventListener('canplaythrough', ready, { once: true })
            a.addEventListener('loadeddata', ready, { once: true })
            a.addEventListener('error', fail, { once: true })
        })
    }

    async loadSounds(manifest) {
        const entries = Object.entries(manifest)
        const loaded = await Promise.all(entries.map(([k, url]) => this.loadAudio(url).then(a => [k, a])))
        return Object.fromEntries(loaded)
    }

    async createCard(frontPath, fragmentPath) {
        const [frontImg, fragmentImg] = await Promise.all([
            this.loadImage(frontPath),
            this.loadImage(fragmentPath)
        ])
        return new Card(frontImg, this.backImg, fragmentImg, this.deckLocation)
    }

    async loadCards(manifest) {
        const entries = Object.entries(manifest)
        const pairs = await Promise.all(entries.map(async ([key, [front, frag]]) => [key, await this.createCard(front, frag)]))
        return Object.fromEntries(pairs)
    }

    async init() {
        this.backImg = await this.loadImage("assets/tarot/images/tarot/back.png")
        const cardManifest = {
            world: ["assets/tarot/images/tarot/world.png", "assets/tarot/images/fragments/crown.png"], // Crown = completion, success
            wheel_of_fortune: ["assets/tarot/images/tarot/wheel_of_fortune.png", "assets/tarot/images/fragments/coin.png"], // Coin = luck, fortune
            chariot: ["assets/tarot/images/tarot/chariot.png", "assets/tarot/images/fragments/dagger.png"], // Dagger = determination, battle
            devil: ["assets/tarot/images/tarot/devil.png", "assets/tarot/images/fragments/skull.png"], // Skull = temptation, mortality
            emporer: ["assets/tarot/images/tarot/emperor.png", "assets/tarot/images/fragments/crown.png"], // Crown = authority
            empress: ["assets/tarot/images/tarot/empress.png", "assets/tarot/images/fragments/heart.png"], // Heart = love, nurturing
            fool: ["assets/tarot/images/tarot/fool.png", "assets/tarot/images/fragments/coin.png"], // Coin = chance, new beginnings
            hangedMan: ["assets/tarot/images/tarot/hanged_man.png", "assets/tarot/images/fragments/goblet.png"], // Goblet = sacrifice, contemplation
            hermis: ["assets/tarot/images/tarot/hermit.png", "assets/tarot/images/fragments/skull.png"], // Skull = solitude, wisdom
            hierophant: ["assets/tarot/images/tarot/hierophant.png", "assets/tarot/images/fragments/crown.png"], // Crown = spiritual authority
            high_priestess: ["assets/tarot/images/tarot/high_priestess.png", "assets/tarot/images/fragments/goblet.png"], // Goblet = mystery, intuition
            lovers: ["assets/tarot/images/tarot/lovers.png", "assets/tarot/images/fragments/heart.png"], // Heart = love, union
            magician: ["assets/tarot/images/tarot/magician.png", "assets/tarot/images/fragments/coin.png"], // Coin = manifestation, power
            strength: ["assets/tarot/images/tarot/strength.png", "assets/tarot/images/fragments/dagger.png"], // Dagger = courage, inner strength
            death: ["assets/tarot/images/tarot/death.png", "assets/tarot/images/fragments/skull.png"], // Skull = transformation, endings
            judgement: ["assets/tarot/images/tarot/judgement.png", "assets/tarot/images/fragments/crown.png"], // Crown = awakening, higher calling
            justice: ["assets/tarot/images/tarot/justice.png", "assets/tarot/images/fragments/dagger.png"], // Dagger = truth, fairness
            moon: ["assets/tarot/images/tarot/moon.png", "assets/tarot/images/fragments/goblet.png"], // Goblet = dreams, illusions
            star: ["assets/tarot/images/tarot/star.png", "assets/tarot/images/fragments/coin.png"], // Coin = hope, prosperity
            sun: ["assets/tarot/images/tarot/sun.png", "assets/tarot/images/fragments/heart.png"], // Heart = joy, vitality
            temperance: ["assets/tarot/images/tarot/temperance.png", "assets/tarot/images/fragments/goblet.png"], // Goblet = balance, harmony
            tower: ["assets/tarot/images/tarot/tower.png", "assets/tarot/images/fragments/skull.png"] // Skull = chaos, destruction
        };
        this.cards = await this.loadCards(cardManifest)

        const soundManifest = {
            flip: "assets/tarot/sounds/flip.mp3",
            play: "assets/tarot/sounds/play.mp3",
            break: "assets/tarot/sounds/break.mp3"
        }
        this.sounds = await this.loadSounds(soundManifest)
    }

    addCard(card) {
        if (!card) return
        if (this.addedCards.includes(card) || this.placedCards.includes(card)) return
        if (this.removedCards.includes(card)) {
            card.reset(this.deckLocation)
            this.removedCards = this.removedCards.filter(c => c !== card)
        }
        this.sounds.play.play()
        card.target = this.center
        this.placedCards.push(card)
    }

    removeCard(card) {
        if (!card) return
        if (this.removedCards.includes(card)) return
        if (typeof card.break === 'function') card.break()
        this.sounds.break.play()
        this.addedCards = this.addedCards.filter(c => c !== card)
        this.placedCards = this.placedCards.filter(c => c !== card)
        this.removedCards.push(card)
    }

    layoutCircle(dt) {
        this.rotation += this.rotationSpeed * dt
        if (this.rotation > Math.PI * 2) this.rotation -= Math.PI * 2
        const n = this.addedCards.length
        if (!n) return
        if (n === 1 && this.placedCards.length === 0) {
            this.addedCards[0].target = { x: this.center.x, y: this.center.y }
            return
        }
        for (let i = 0; i < n; i++) {
            const ang = ((i / n) * Math.PI * 2 - Math.PI / 2) + this.rotation
            this.addedCards[i].target = {
                x: this.center.x + Math.cos(ang) * this.radius,
                y: this.center.y + Math.sin(ang) * this.radius
            }
        }
    }

    update(dt) {
        dt = Math.min(dt, 0.05)
        if (this.placedCards.length && this.addedCards.length < this.maxAddedCards) {
            const card = this.placedCards[0]
            const distanceSquared = (card.position.x - card.target.x) ** 2 + (card.position.y - card.target.y) ** 2
            if (distanceSquared < this.distanceThreshold ** 2)
                if (card.currentImage === card.backImage) {
                    card.flip()
                    this.sounds.flip.play()
                }
                else if (!card.flipping) {
                    this.addedCards.push(card)
                    this.placedCards.shift()
                }
        }
        for (let i = this.removedCards.length - 1; i >= 0; i--) {
            const card = this.removedCards[i]
            const fragments = Array.isArray(card.fragments) ? card.fragments : []
            const allFragmentsOffscreen = fragments.every(f => {
                const sx = card.position.x * ctx.canvas.width / 100 + f.x
                const sy = card.position.y * ctx.canvas.height / 100 + f.y
                return sx < -50 || sx > ctx.canvas.width + 50 || sy < -50 || sy > ctx.canvas.height + 50
            })
            if (allFragmentsOffscreen) {
                if (typeof card.reset === 'function') card.reset(this.deckLocation)
                this.removedCards.splice(i, 1)
            }
        }
        this.layoutCircle(dt)
        this.placedCards.forEach(c => c.update(dt))
        this.addedCards.forEach(c => c.update(dt))
        this.removedCards.forEach(c => c.update(dt))
    }

    draw(ctx) {
        for (let i = this.placedCards.length - 1; i >= 0; i--) {
            this.placedCards[i].draw(ctx);
        }
        for (let i = this.addedCards.length - 1; i >= 0; i--) {
            this.addedCards[i].draw(ctx);
        }
        for (let i = this.removedCards.length - 1; i >= 0; i--) {
            this.removedCards[i].draw(ctx);
        }
    }
}

const canvas = document.getElementById("tarot")
const ctx = canvas.getContext("2d")
const game = new Game()

async function boot() {
    await game.init()
    const keys = Object.keys(game.cards)

    function addRandomAvailableCard() {
        const available = keys
            .map(k => game.cards[k])
            .filter(c => !game.addedCards.includes(c) && !game.placedCards.includes(c))
        if (available.length === 0) return
        const card = available[Math.floor(Math.random() * available.length)]
        game.addCard(card)
    }

    function deleteRandomCard() {
        for (const card of game.addedCards) game.removeCard(card)
    }

    const inputHandler = () => addRandomAvailableCard()
    window.addEventListener('click', inputHandler)
    window.addEventListener('keydown', deleteRandomCard)

    let last = performance.now()
    function loop() {
        const now = performance.now()
        const dt = (now - last) / 1000
        last = now

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        game.update(dt)
        game.draw(ctx)
        requestAnimationFrame(loop)
    }
    loop()
}

boot()