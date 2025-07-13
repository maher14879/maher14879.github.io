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
        this.chunkLoadState = new Map();
        this.brightnessMap = new Map();
        this.camera = [0, 0];

        // Preset values
        this.maxLight = 16;
        this.sunLight = 5;
        this.background = 'black';
        this.attenuation = 2;
        this.chunkSize = 4;
        this.diagnostics = false;
        this.axis = [0, 1, 2];
        this.renderDistance = 4;
        this.worldHeight = 10;

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
        
        // Set canvas size
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
            alphaMode: 'premultiplied' // Important for transparency
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

        // Create pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({
                    code: `
                    struct Uniforms {
                        canvasSize: vec2f,
                        textureSize: vec2f
                    };

                    @group(0) @binding(2) var<uniform> uniforms: Uniforms;

                    struct VertexInput {
                        @location(0) position: vec2f,
                        @location(1) uv: vec2f,
                        @location(2) instanceScreenPos: vec2f,
                        @location(3) instanceTexPos: vec2f,
                        @location(4) instanceSize: vec2f
                    };

                    struct VertexOutput {
                        @builtin(position) position: vec4f,
                        @location(0) uv: vec2f
                    };

                    @vertex
                    fn main(input: VertexInput) -> VertexOutput {
                        var output: VertexOutput;
                        
                        // Convert to clip space
                        let pixelPos = input.position * input.instanceSize + input.instanceScreenPos;
                        var clipPos = (pixelPos / uniforms.canvasSize) * 2.0 - 1.0;
                        clipPos.y = -clipPos.y; // Flip Y axis
                        
                        output.position = vec4f(clipPos, 0.0, 1.0);
                        
                        // Calculate texture coordinates
                        output.uv = input.uv * input.instanceSize / uniforms.textureSize + input.instanceTexPos;
                        return output;
                    }
                    `
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
                        arrayStride: 6 * 4,
                        stepMode: 'instance',
                        attributes: [
                            { format: 'float32x2', offset: 0, shaderLocation: 2 }, // screenPos
                            { format: 'float32x2', offset: 8, shaderLocation: 3 }, // texPos
                            { format: 'float32x2', offset: 16, shaderLocation: 4 } // size
                        ]
                    }
                ]
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: `
                    @group(0) @binding(0) var tex: texture_2d<f32>;
                    @group(0) @binding(1) var samp: sampler;

                    @fragment
                    fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
                        return textureSample(tex, samp, uv);
                    }
                    `
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
        this.spriteData = new Float32Array(newCapacity * 6);
        
        // Initialize instance buffer if it doesn't exist
        if (!this.instanceBuffer) {
            this.instanceBuffer = this.device.createBuffer({
                size: this.spriteData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                mappedAtCreation: false
            });
        } else {
            // Create new larger buffer
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
            size: [imageBitmap.width, imageBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: this.texture },
            [imageBitmap.width, imageBitmap.height]
        );

        // Update uniform buffer
        const uniformData = new Float32Array([
            this.canvas.width, this.canvas.height,
            imageBitmap.width, imageBitmap.height
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.texture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.uniformBuffer } }
            ]
        });
    }

    drawImage(x, y, sx, sy) {
        if (this.spriteCount >= this.maxSprites) {
            this.setCapacity(Math.floor(this.maxSprites * 1.5));
        }

        const offset = this.spriteCount * 6;
        this.spriteData[offset + 0] = x; // screenX
        this.spriteData[offset + 1] = y; // screenY
        this.spriteData[offset + 2] = sx; // texX
        this.spriteData[offset + 3] = sy; // texY
        this.spriteData[offset + 4] = this.width; // width
        this.spriteData[offset + 5] = this.height; // height
        this.spriteCount++;
    }

    end() {
        if (this.spriteCount === 0) return;

        this.device.queue.writeBuffer(
            this.instanceBuffer,
            0,
            this.spriteData.buffer,
            0,
            this.spriteCount * 6 * 4
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

    lerp(a, b, dt) {
        return b + (a-b) * Math.exp(-this.decay * dt)
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
                            if (isoX + width < 0 || isoY + height < 0 || isoX > canvasWidth || isoY > canvasHeight) continue;
                            if (this.solidArray[block] == 10) {
                                const key = `${y - x},${z - x}`;
                                const magnitude = x + y + z;
                                const existing = visibilityMap[key];
                                if (!existing || magnitude > existing[4]) {
                                    visibilityMap[key] = [x, y, z, block, magnitude, isoX, isoY];
                                }
                            } else {
                                nonSolid.push([x, y, z, block, 0, isoX, isoY]);
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
                clearValue: [0, 0, 0, 1],  // RGBA black
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        clearPass.end();
        this.device.queue.submit([encoder.finish()]);

        // Reset sprite counter
        this.spriteCount = 0;

    }

    draw() {
        const startTime = performance.now();
        const blocksArray = this.sortBlocks();
        const drawStartTime = performance.now();

        this.begin()

        let drawCount = 0;
        const w = this.width;
        const h = this.height;

        for (const [x, y, z, block, magnitude, isoX, isoY] of blocksArray) {
            if (this.solidArray[block] == 10) {
                const texture = this.textureArray[block];
                for (const axis of this.axis) {
                    const [ix, iy] = texture[axis];
                    const sx = ix * w / this.texture.width;
                    const sy = iy * h / this.texture.height; 
                    this.drawImage(isoX, isoY, sx, sy);
                    drawCount++;
                }
            } else {
                const [ix, iy] = this.textureArray[block];
                const sx = ix * w / this.texture.width;
                const sy = iy * h / this.texture.height;
                this.drawImage(isoX, isoY, sx, sy);
                drawCount++;
            }
        }

        this.end();

        if (this.diagnostics) {
            const drawTime = (performance.now() - drawStartTime).toFixed(2);
            const fps = (1000 / (performance.now() - startTime)).toFixed(2);
            console.log("fps:", fps);
            console.log("drawTime:", drawTime);
            console.log("DrawCount:", drawCount);
        }
    }

    loadChunk(cx, cy) {
        const startTime = performance.now();
        this.createChunk(cx, cy);
        this.SetChunkLoadState(cx, cy, 1)
        const chunkCreationTime = (performance.now() - startTime).toFixed(2);
        console.log("Creating chunk", cx, cy, "took:", chunkCreationTime);
    }

    updateChunks() {
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
                };
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {

                        }
                    }
                }
            }
        }
    }

    noise(x, y, amplitude) {
        let h = 0;
        const octaves = 9;
        const scale = 0.04;
        const persistence = 0.4;

        for (let i = 0; i < octaves; i++) {
            const freq = Math.pow(2, i);
            const amp = Math.pow(persistence, i);
            h += amp * (Math.sin(x * scale * freq) + Math.cos(y * scale * freq));
        }
        return Math.round(Math.exp(h) * amplitude);
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
                
                let h = Math.max(this.noise(x, y, 1), 1);
                
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

// Usage:
const textureSheet = new Image();
textureSheet.crossOrigin = 'anonymous';
textureSheet.src = 'assets/texture_sheet.png';

const textureArray = [
    [0, 0],
    [0, 1], 
    [[1, 2], [1,1], [1,0]], 
    [[1, 5], [1,4], [1,3]], 
    [[2, 2], [2,1], [2,0]], 
    [[2, 5], [2,4], [2,3]], 
    [0, 2]
];

const solidArray = [6, 8, 10, 10, 10, 10, 0];
const arcade = new IsoArcade(4, 16, 16, textureArray, solidArray);
arcade.diagnostics = true
await arcade.init("game");
await arcade.setTexture(textureSheet);

function moveCamera(e) {
    const speed = 1;
    if (e.key == 'w') {
        arcade.camera[0] -= speed;
        arcade.camera[1] -= speed;
    }
    if (e.key == 's') {
        arcade.camera[0] += speed;
        arcade.camera[1] += speed;
    }
    if (e.key == 'a') {
        arcade.camera[0] -= speed;
        arcade.camera[1] += speed;
    }
    if (e.key == 'd') {
        arcade.camera[0] += speed;
        arcade.camera[1] -= speed;
    }
    scheduleDraw();
}

let needsRedraw = false;
function scheduleDraw() {
    if (!needsRedraw) {
        needsRedraw = true;
        requestAnimationFrame(() => {
            console.clear()
            arcade.updateChunks();
            arcade.draw()
            needsRedraw = false;
        });
    }
}

window.addEventListener("keydown", moveCamera);