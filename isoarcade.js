class IsoArcade {
    constructor(offset, width, height, textureArray, solidArray) {       
        // User defined
        this.offset = offset;
        this.width = width;
        this.height = height;
        this.textureArray = textureArray;
        this.solidArray = solidArray;

        // Data storage
        this.spriteCount = 0;
        this.blocksMap = new Map();
        this.lightMap = new Map();
        this.chunkLoadState = new Map();
        this.camera = [0, 0];

        // Preset values
        this.maxLight = 16;
        this.sunLight = 3;
        this.attenuation = 2;
        this.fogScale = 100;
        this.chunkSize = 4; //root of actual size
        this.diagnostics = false;
        this.axis = [0, 1, 2];
        this.renderDistance = 5;
        this.worldHeight = 20;

        // WebGPU
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
        this.maxSprites = 0;
        this.spriteCount = 0;
        this.spriteData = null;
    }

    async init(id, initialCapacity = 10000) {
        this.canvas = document.getElementById(id);
        if (!this.canvas) throw new Error('Canvas not found');
        
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        if (!navigator.gpu) throw Error("WebGPU not supported.");
        
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) throw Error("Couldn't request WebGPU adapter.");
        
        this.device = await this.adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        });

        // Quad geometry (two triangles forming a quad)
        const quadVertices = new Float32Array([
            // positions   // uvs
            -0.5, -0.5,    0.0, 0.0,
             0.5, -0.5,    1.0, 0.0,
             0.5,  0.5,    1.0, 1.0,
            -0.5,  0.5,    0.0, 1.0
        ]);

        const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.vertexBuffer = this.device.createBuffer({
            size: quadVertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(quadVertices);
        this.vertexBuffer.unmap();

        this.indexBuffer = this.device.createBuffer({
            size: quadIndices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint16Array(this.indexBuffer.getMappedRange()).set(quadIndices);
        this.indexBuffer.unmap();

        // Create uniform buffer for canvas and texture sizes
        this.uniformBuffer = this.device.createBuffer({
            size: 16, // 4 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.setCapacity(initialCapacity);

        const shaderResponse = await fetch('/shaders/vertex.wgsl');
        const shaderCode = await shaderResponse.text();

        const fragmentResponse = await fetch('/shaders/fragment.wgsl');
        const fragmentCode = await fragmentResponse.text();

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({
                    code: shaderCode
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 4 * 4,
                        attributes: [
                            { format: 'float32x2', offset: 0, shaderLocation: 0 },
                            { format: 'float32x2', offset: 8, shaderLocation: 1 }
                        ]
                    },
                    {
                        arrayStride: 8 * 4,
                        stepMode: 'instance',
                        attributes: [
                            { format: 'float32x2', offset: 0,  shaderLocation: 2 },
                            { format: 'float32x2', offset: 8,  shaderLocation: 3 },
                            { format: 'float32x2', offset: 16, shaderLocation: 4 },
                            { format: 'float32',   offset: 24, shaderLocation: 5 },
                            { format: 'float32',   offset: 28, shaderLocation: 6 }
                        ]
                    }
                ]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: fragmentCode
                }),
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    },
                    writeMask: GPUColorWrite.ALL
                }]
            },
            primitive: {
                topology: 'triangle-list',
                indexFormat: 'uint16'
            }
        });

        // Create sampler
        this.sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });
    }

    setCapacity(newCapacity) {
        if (newCapacity <= this.maxSprites) return;

        this.maxSprites = newCapacity;
        this.spriteData = new Float32Array(newCapacity * 8);
        
        if (!this.instanceBuffer) {
            this.instanceBuffer = this.device.createBuffer({
                size: this.spriteData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                mappedAtCreation: false
            });
        } else {
            const oldBuffer = this.instanceBuffer;
            this.instanceBuffer = this.device.createBuffer({
                size: this.spriteData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
            });
            oldBuffer.destroy();
        }
    }

    async setTexture(image) {
        await image.decode();
        const imageBitmap = await createImageBitmap(image);

        if (this.texture) {
            this.texture.destroy();
        }

        this.texture = this.device.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: this.texture },
            [imageBitmap.width, imageBitmap.height]
        );
        const uniformData = new Float32Array([
            this.canvas.width, this.canvas.height,
            imageBitmap.width, imageBitmap.height
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.texture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });
    }

    drawImage(x, y, sx, sy, brightness, distance) {
        if (this.spriteCount >= this.maxSprites) {
            this.setCapacity(Math.floor(this.maxSprites * 1.5));
        }

        const offset = this.spriteCount * 8;
        this.spriteData[offset + 0] = x;
        this.spriteData[offset + 1] = y;
        this.spriteData[offset + 2] = sx;
        this.spriteData[offset + 3] = sy;
        this.spriteData[offset + 4] = this.width;
        this.spriteData[offset + 5] = this.height;
        this.spriteData[offset + 6] = brightness;
        this.spriteData[offset + 7] = distance;
        this.spriteCount++;
    }

    end() {
        if (this.spriteCount === 0) return;

        this.device.queue.writeBuffer(
            this.instanceBuffer,
            0,
            this.spriteData.buffer,
            0,
            this.spriteCount * 8 * 4
        );

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setVertexBuffer(1, this.instanceBuffer);
        pass.setIndexBuffer(this.indexBuffer, 'uint16');
        pass.setBindGroup(0, this.bindGroup);
        pass.drawIndexed(6, this.spriteCount);

        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    getChunkLoadState(cx, cy) {
        return this.chunkLoadState.get(cx)?.get(cy) ?? 0;
    }

    SetChunkLoadState(cx, cy, state) {
        if (!this.chunkLoadState.has(cx)) this.chunkLoadState.set(cx, new Map());
        this.chunkLoadState.get(cx).set(cy, state);
    }

    getBlock(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        return this.getChunk(cx, cy)?.get(x)?.get(y)?.get(z);
    }

    hasChunk(cx, cy) {
        return this.getChunk(cx, cy) !== undefined;
    }

    getChunk(cx, cy) {
        return this.blocksMap.get(cx)?.get(cy);
    }

    roundChunk(x, y) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        return [cx, cy]
    }

    setBlock(x, y, z, block) {
        const [cx, cy] = this.roundChunk(x, y)
        if (!this.blocksMap.has(cx)) this.blocksMap.set(cx, new Map());
        const cyMap = this.blocksMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, block);
    }

    deleteBlock(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        this.getChunk(cx, cy)?.get(x)?.get(y)?.delete(z);
    }

    hasBlock(x, y, z) {
        return this.getBlock(x, y, z) !== undefined;
    }

    getSkyLight(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        const pillar = this.getChunk(cx, cy)?.get(x)?.get(y);
        return Math.max(...pillar.keys());
    }

    addLight(x, y, z, value, axis) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightMap.has(cx)) this.lightMap.set(cx, new Map());
        const cyMap = this.lightMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap.has(z)) zMap.set(z, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);

        const prev = zMap.get(z);
        const updated = [...prev];
        updated[axis] += value;
        zMap.set(z, updated);
    }

    hasLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return !!this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    getLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    getIsometricPosition(x, y, z) {
        const worldX = x - this.camera[0];
        const worldY = y - this.camera[1];
        const worldZ = z

        const xFactor = (this.width / 2);
        const yFactorZ = (this.height - 2 * this.offset);
        const yFactor = this.offset;

        return [Math.ceil(xFactor * (worldX - worldY) + this.canvas.width / 2), Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + this.canvas.height / 2)];
    }

    sortBlocks() {
        const startTime = performance.now();

        const visibilityMap = Object.create(null);
        const nonSolid = [];

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const width = this.width;
        const height = this.height;

        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1])
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                            const [isoX, isoY] = this.getIsometricPosition(x, y, z);
                            if (isoX + width < 0 || isoY + height < 0 || isoX - width > canvasWidth || isoY - height > canvasHeight) continue;
                            const magnitude = x + y + z;
                            if (this.solidArray[block] == 10) {
                                const key = `${y - x},${z - x}`;
                                const existing = visibilityMap[key];
                                if (!existing || magnitude > existing[4]) {
                                    visibilityMap[key] = [x, y, z, block, magnitude, isoX, isoY];
                                }
                            } else {
                                nonSolid.push([x, y, z, block, magnitude, isoX, isoY]);
                                continue;
                            }
                        }
                    }
                }
            }
        }

        const sortStartTime = performance.now();

        const blocksArray = Object.values(visibilityMap).concat(nonSolid);
        blocksArray.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));

        if (this.diagnostics) {
            const filterTime = (sortStartTime - startTime).toFixed(2);
            console.log("filterTIme:", filterTime);
            const sortTime = (performance.now() - sortStartTime).toFixed(2);
            console.log("sortTime:", sortTime);
        }

        return blocksArray
    }

    begin() {
        const encoder = this.device.createCommandEncoder();
        const clearPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        clearPass.end();
        this.device.queue.submit([encoder.finish()]);
        this.spriteCount = 0;

    }

    draw() {
        const blocksArray = this.sortBlocks();
        const drawStartTime = performance.now();

        this.begin()

        let drawCount = 0;
        const w = this.width;
        const h = this.height;
        const [camX, camY] = this.camera

        for (const [x, y, z, block, magnitude, isoX, isoY] of blocksArray) {
            const brightnessValues = this.getLight(x, y, z) ?? [0,0,0,0,0,0];
            const fog = Math.min(1, Math.abs(x - camX + y - camY) / this.fogScale)**2
            if (this.solidArray[block] == 10) {
                const texture = this.textureArray[block];
                for (const axis of this.axis) {
                    const [ix, iy] = texture[axis];
                    const sx = ix * w / this.texture.width;
                    const sy = iy * h / this.texture.height;
                    const brightness = Math.max(0, Math.min(brightnessValues[axis], this.maxLight)) / this.maxLight;
                    this.drawImage(isoX, isoY, sx, sy, brightness, fog);
                    drawCount++;
                }
            } else {
                const [ix, iy] = this.textureArray[block];
                const sx = ix * w / this.texture.width;
                const sy = iy * h / this.texture.height;
                const brightness = Math.max(0, Math.min(Math.max(...brightnessValues), this.maxLight)) / this.maxLight;
                this.drawImage(isoX, isoY, sx, sy, brightness, fog);
                drawCount++;
            }
        }

        this.end();

        if (this.diagnostics) {
            const drawTime = (performance.now() - drawStartTime).toFixed(2);
            console.log("drawTime:", drawTime);
            console.log("DrawCount:", drawCount);
        }
    }

    async loadChunk(cx, cy) {
        const startTime = performance.now();
        this.createChunk(cx, cy);
        this.SetChunkLoadState(cx, cy, 1)
        if (this.diagnostics) {
            const chunkCreationTime = (performance.now() - startTime).toFixed(2);
            console.log("Creating chunk", cx, cy, "took:", chunkCreationTime);
        }
    }

    updateChunks() {
        const startTime = performance.now();
        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam - 1; cx <= this.renderDistance + cxCam + 1; cx++) {
            for (let cy = -this.renderDistance + cyCam - 1; cy <= this.renderDistance + cyCam + 1; cy++) {
                if (this.getChunkLoadState(cx, cy) == 0) {
                    this.loadChunk(cx, cy)
                }
            }
        }

        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                if (this.getChunkLoadState(cx, cy) == 1) {
                    const neighborsLoaded = (
                        (this.getChunkLoadState(cx+1, cy) > 0) &&
                        (this.getChunkLoadState(cx-1, cy) > 0) &&
                        (this.getChunkLoadState(cx, cy+1) > 0) &&
                        (this.getChunkLoadState(cx, cy-1) > 0) &&
                        (this.getChunkLoadState(cx-1, cy-1) > 0) &&
                        (this.getChunkLoadState(cx+1, cy+1) > 0) &&
                        (this.getChunkLoadState(cx-1, cy+1) > 0) &&
                        (this.getChunkLoadState(cx+1, cy-1) > 0)
                    );

                    if (neighborsLoaded) {
                        this.chunkLight(cx, cy);

                        //tests
                        const size = this.chunkSize**2;
                        const z = this.getSkyLight(cx * size, cy * size);
                        if (this.getBlock(cx * size, cy * size, z) == 2) {
                        this.setBlock(cx * size, cy * size, z + 1, 6);
                        this.setLight(cx * size, cy * size, z + 1, 16, 6);
                        }
                    }
                };
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {

                        }
                    }
                }
            }
        }
        if (self.diagnostics) {
            const updateChunksTime = (performance.now() - startTime).toFixed(2);
            console.log("Update chunks took:", updateChunksTime);
        }
    }

    setLight(startX, startY, startZ, lightStrength, axis) {
        const directions = [
            [-1, 0, 0, 0],
            [0, -1, 0, 1],
            [0, 0, -1, 2],
            [1, 0, 0, 3],
            [0, 1, 0, 4],
            [0, 0, 1, 5]
        ];

        const queue = [{ x: startX, y: startY, z: startZ, lightStrength: lightStrength, axis: axis}];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, lightStrength, axis } = queue.shift();
            const key = `${x},${y},${z}`;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, dir] of directions) {
                const [nx, ny, nz] = [x + dx, y + dy, z + dz];
                const hasBlock = this.hasBlock(nx, ny, nz);
                if (hasBlock) {this.addLight(nx, ny, nz, lightStrength, dir)};

                const transparency = 1 - ((hasBlock ? this.solidArray[this.getBlock(nx, ny, nz)] : 0) / 100)
                const newLightStrength = (lightStrength - ((dir == axis) ? 1 : this.attenuation )) * transparency;
                if (newLightStrength > 0) {
                    queue.push({ x: nx, y: ny, z: nz, lightStrength: newLightStrength, axis: dir })
                }
            }
        }
    }

    async chunkLight(cx, cy) {
        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const z = this.getSkyLight(dx + cx * size, dy + cy * size);
                this.setLight(dx + cx * size, dy + cy * size, z + 1, this.sunLight, -1);
            }
        }
        this.SetChunkLoadState(cx, cy, 2)
    }

    noise(x, y) {
        let h = 0;
        const octaves = 9;
        const scale = 0.04;
        const persistence = 0.4;

        for (let i = 0; i < octaves; i++) {
            const freq = Math.pow(2, i);
            const amp = Math.pow(persistence, i);
            h += amp * (Math.sin(x * scale * freq) + Math.cos(y * scale * freq));
        }
        return Math.exp(h);
    }

    createTree(x, y, z) {
        for (let dz = z; dz < z+4; dz++) {
            this.setBlock(x, y, dz, 4)
        }
        for (let dz = z+4; dz < z+6; dz++) {
            this.setBlock(x, y, dz, 4)
            //leaves
            this.setBlock(x+1, y, dz, 0)
            this.setBlock(x, y+1, dz, 0)
            this.setBlock(x+1, y+1, dz, 0)
            this.setBlock(x-1, y, dz, 0)
            this.setBlock(x, y-1, dz, 0)
            this.setBlock(x-1, y-1, dz, 0)
            this.setBlock(x+1, y-1, dz, 0)
            this.setBlock(x-1, y+1, dz, 0)
        }
        this.setBlock(x, y, z+6, 0)
        this.setBlock(x+1, y, z+6, 0)
        this.setBlock(x, y+1, z+6, 0)
        this.setBlock(x+1, y+1, z+6, 0)
        this.setBlock(x-1, y, z+6, 0)
        this.setBlock(x, y-1, z+6, 0)
        this.setBlock(x-1, y-1, z+6, 0)
        this.setBlock(x+1, y-1, z+6, 0)
        this.setBlock(x-1, y+1, z+6, 0)
    }

    createChunk(cx, cy) {
        const size = this.chunkSize**2;
        
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const x = dx + cx * size;
                const y = dy + cy * size;
                this.setBlock(x, y, 1, 3);// Dirt
                this.setBlock(x, y, 2, 1);// water
                
                let h = Math.max(Math.round(this.noise(x, y)), 1);
                
                const mountainThreshold = this.worldHeight * 0.6;
                if (h > mountainThreshold) {
                    for (let z = 0; z < h + (h - mountainThreshold) * 2; z++) {
                        this.setBlock(x, y, z, 5);
                    }
                } 
                if ((1 < h) && (h < mountainThreshold)) {
                    for (let z = 0; z < h; z++) {
                        this.setBlock(x, y, z, 3); // Dirt
                    }
                    this.setBlock(x, y, h, 2); // Grass on top
                    if (Math.random() < 0.01) {this.createTree(x, y, h)}

                }
            }
        }
    }

    saveWorld() {

    }
}

const textureSheet = new Image();
textureSheet.crossOrigin = 'anonymous';
textureSheet.src = 'assets/texture_sheet.png';

const textureArray = [
    [0, 0], //leaves
    [0, 1], //water
    [[1, 2], [1,1], [1,0]], //grass
    [[1, 5], [1,4], [1,3]], //dirt
    [[2, 2], [2,1], [2,0]], //wood
    [[2, 5], [2,4], [2,3]], //stone
    [0, 2] //torch
];

const solidArray = [2, 8, 10, 10, 10, 10, 0];
const arcade = new IsoArcade(4, 16, 16, textureArray, solidArray);
arcade.diagnostics = false
await arcade.init("game");
await arcade.setTexture(textureSheet);

const centerX = arcade.canvas.width / 2;
const centerY = arcade.canvas.height / 2;

const speed = 0.05;

let keyW = false;
let keyS = false;
let keyA = false;
let keyD = false;

window.addEventListener("keydown", (e) => {
    if (e.key === 'w') keyW = true;
    if (e.key === 's') keyS = true;
    if (e.key === 'a') keyA = true;
    if (e.key === 'd') keyD = true;
});

window.addEventListener("keyup", (e) => {
    if (e.key === 'w') keyW = false;
    if (e.key === 's') keyS = false;
    if (e.key === 'a') keyA = false;
    if (e.key === 'd') keyD = false;
});

function gameLoop(timestamp) {
    const dt = timestamp - (gameLoop.lastTime || timestamp)

    let dx = 0, dy = 0;
    if (keyW) { dx += -1; dy += -1; }
    if (keyS) { dx += 1; dy += 1; }
    if (keyA) { dx += -1; dy += 1; }
    if (keyD) { dx += 1; dy += -1; }

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        arcade.camera[0] += dx * speed * dt;
        arcade.camera[1] += dy * speed * dt;
    }

    arcade.updateChunks();
    arcade.draw();
    gameLoop.lastTime = timestamp;

    if (arcade.diagnostics) {
        const fps = (1000 / dt).toFixed(2);
        console.log("fps:", fps);
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);