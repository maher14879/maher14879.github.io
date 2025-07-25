class IsoArcade {
    constructor(offset, width, height, textureArray, solidArray) {       
        // User defined
        this.offset = offset;
        this.width = width;
        this.height = height;
        this.textureArray = textureArray;
        this.solidArray = solidArray;

        // Preset values
        this.maxLight = 16;
        this.sunLuminosity = 4;
        this.sunAxis = -3;
        this.attenuation = 2.5;
        this.fogScale = 200;
        this.chunkSize = 4; //root of actual size
        this.diagnostics = false;
        this.axis = [1, 2, 3];
        this.renderDistance = 7;
        this.worldHeight = 30;
        this.minLight = 3
        this.tickPerSecond = 5;
        this.blocksPerSecond = 10;
        this.CameraSpeed = 16;
        
        // WebGPU
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
        this.maxSprites = 0;
        this.spriteCount = 0;
        this.spriteData = null;

        // Calculated
        this.blockPlaceTime = 1 / this.blocksPerSecond;
        this.tickTime = (1 / this.tickPerSecond)

        // Data storage
        this.spriteCount = 0;
        this.dt = this.tickTime;
        this.dtBlockPlaced = 0.;
        this.blocksMap = new Map();
        this.lightMap = new Map();
        this.lightSourceMap = new Map();
        this.chunkLoadState = new Map();
        this.camera = [0, 0];
        this.camDirection = [0, 0];
        this.blocksArray = [];
        this.EnqueuedBlock = [];
    }

    async init(id, initialCapacity = 10000) {
        this.canvas = document.getElementById(id);
        if (!this.canvas) throw new Error('Canvas not found');

        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        this.canvas.style.imageRendering = 'pixelated'; //maybe remove

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

    drawImage(x, y, sx, sy, w, h, brightness, distance) {
        if (this.spriteCount >= this.maxSprites) {
            this.setCapacity(Math.floor(this.maxSprites * 1.5));
        }

        const offset = this.spriteCount * 8;
        this.spriteData[offset + 0] = x;
        this.spriteData[offset + 1] = y;
        this.spriteData[offset + 2] = sx;
        this.spriteData[offset + 3] = sy;
        this.spriteData[offset + 4] = w;
        this.spriteData[offset + 5] = h;
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

    addLight(x, y, z, luminosity, axis) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightMap.has(cx)) this.lightMap.set(cx, new Map());
        const cyMap = this.lightMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap.has(z)) zMap.set(z, [0.01, 0.01, 0.01, 0.01, 0.01, 0.01]);

        const prev = zMap.get(z);
        const updated = [...prev];
        updated[this.axisToIndex(axis)] += luminosity;
        zMap.set(z, updated);
    }

    hasLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return !!this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    axisToIndex(axis) {
        return axis < 0 ? -axis + 2 : axis - 1;
    }

    getLight(x, y, z, axis) {
        const [cx, cy] = this.roundChunk(x, y);
        const luminosities = this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z) || [0,0,0,0,0,0];
        if (axis) {return luminosities[this.axisToIndex(axis)]}
        else {return luminosities}
    }

    setLightSource(x, y, z, luminosity, axis) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightSourceMap.has(cx)) this.lightSourceMap.set(cx, new Map());
        const cyMap = this.lightSourceMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, []);
        const lightSourceArray = cyMap.get(cy);
        lightSourceArray.push([x, y, z, luminosity, axis])
    }

    getLightSources(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightSourceMap.get(cx)?.get(cy);
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

    async sortBlocks() {
        const startTime = performance.now();

        const visibilityMap = new Map(); // Faster than object with string keys
        const nonSolid = [];

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const w = this.width;
        const h = this.height;

        const cxOffset = -this.renderDistance + this.roundChunk(this.camera[0], this.camera[1])[0];
        const cyOffset = -this.renderDistance + this.roundChunk(this.camera[0], this.camera[1])[1];

        const camX = this.camera[0];
        const camY = this.camera[1];
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;

        const canvasBorderX = w * this.CameraSpeed / this.tickPerSecond
        const canvasBorderY = h * this.CameraSpeed / this.tickPerSecond

        const xFactor = w / 2;
        const yFactorZ = h - 2 * this.offset;
        const yFactor = this.offset;

        const encodeKey = (dy, dz) => ((dy + 1024) << 12) | (dz + 1024);

        for (let cx = cxOffset; cx <= cxOffset + 2 * this.renderDistance; cx++) {
            for (let cy = cyOffset; cy <= cyOffset + 2 * this.renderDistance; cy++) {
                const chunk = this.getChunk(cx, cy);
                if (!chunk) continue;

                for (const [x, yMap] of chunk) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                            const worldX = x - camX;
                            const worldY = y - camY;
                            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
                            const isoY = Math.ceil(-z * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);

                            if (isoX + canvasBorderX < 0 || isoY + canvasBorderY < 0 || isoX - canvasBorderX > canvasWidth || isoY - canvasBorderY > canvasHeight) continue;

                            const magnitude = x + y + z;
                            const dy = y - x;
                            const dz = z - x;
                            const key = encodeKey(dy, dz);

                            if (this.solidArray[block] === 10) {
                                const existing = visibilityMap.get(key);
                                if (!existing || magnitude > existing[4]) {
                                    visibilityMap.set(key, [x, y, z, block, magnitude, isoX, isoY]);
                                }
                            } else {
                                nonSolid.push([x, y, z, block, magnitude, isoX, isoY, key]);
                            }
                        }
                    }
                }
            }
        }

        const filtered = [];

        for (const [x, y, z, block, magnitude, isoX, isoY, key] of nonSolid) {
            const existing = visibilityMap.get(key);
            if (!existing || magnitude > existing[4]) {
                filtered.push([x, y, z, block, magnitude, isoX, isoY]);
            }
        }

        const sortStartTime = performance.now();

        const blocksArray = [...visibilityMap.values(), ...filtered];

        blocksArray.sort((a, b) => (a[2] - b[2]) || ((a[0] + a[1]) - (b[0] + b[1])));
        this.blocksArray = blocksArray;

        if (this.diagnostics) {
            console.log("filterTime:", (sortStartTime - startTime).toFixed(2));
            console.log("sortTime:", (performance.now() - sortStartTime).toFixed(2));
        }
    }

    updateBlocks() {
        const camX = this.camera[0];
        const camY = this.camera[1];
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;

        const xFactor = this.width / 2;
        const yFactorZ = this.height - 2 * this.offset;
        const yFactor = this.offset;

        for (let i = 0; i < this.blocksArray.length; i++) {
            const [x, y, z, block, magnitude] = this.blocksArray[i];
            const worldX = x - camX;
            const worldY = y - camY;
            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
            const isoY = Math.ceil(-z * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);
            this.blocksArray[i][5] = isoX;
            this.blocksArray[i][6] = isoY;
        }
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
        const drawStartTime = performance.now();

        this.begin()

        let drawCount = 0;
        const w = this.width;
        const h = this.height;
        const [camX, camY] = this.camera

        const sw = w / this.texture.width
        const sh = h / this.texture.height

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        const topHeight = this.offset * 2
        const sideWidth = w / 2

        const minLight = this.minLight
        const maxLight = this.maxLight

        for (const [x, y, z, block, magnitude, isoX, isoY] of this.blocksArray) {
            if (isoX + w < 0 || isoY + h < 0 || isoX - w > canvasWidth || isoY - h > canvasHeight) continue;
            const fog = Math.min(1, Math.abs(x - camX + y - camY) / this.fogScale)**2
            if (this.solidArray[block] == 10) {
                const texture = this.textureArray[block];
                for (const axis of this.axis) {
                    const [ix, iy] = texture[this.axisToIndex(axis)];
                    const sx = ix * sw;
                    const sy = iy * sh;
                    const brightness = Math.min(1, Math.max(minLight, this.getLight(x, y, z, axis)) / maxLight);
                    this.drawImage(isoX, isoY, sx, sy, w, h, brightness, fog);
                    drawCount++;
                }
            } else {
                const [ix, iy] = this.textureArray[block];
                const sx = (ix * w) / this.texture.width;
                const sy = (iy * h) / this.texture.height;
                const brightness = Math.min(1, Math.max(minLight, Math.max(...this.getLight(x, y, z))) / maxLight);
                this.drawImage(isoX, isoY, sx, sy, w, h, brightness, fog);
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

    async updateChunks() {
        const startTime = performance.now();
        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam - 1; cx <= this.renderDistance + cxCam + 1; cx++) {
            for (let cy = -this.renderDistance + cyCam - 1; cy <= this.renderDistance + cyCam + 1; cy++) {
                if (this.getChunkLoadState(cx, cy) == 0) {
                    await this.loadChunk(cx, cy)
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
                        await this.chunkLight(cx, cy);
                    }
                };
            }
        }
        if (self.diagnostics) {
            const updateChunksTime = (performance.now() - startTime).toFixed(2);
            console.log("Update chunks took:", updateChunksTime);
        }
    }

    async propagateLight(startX, startY, startZ, startLuminosity, startAxis, shadow = false) {
        console.clear()
        const directions = [
            [1, 0, 0, 1],
            [0, 1, 0, 2],
            [0, 0, 1, 3],
            [-1, 0, 0, -1],
            [0, -1, 0, -2],
            [0, 0, -1, -3]
        ];

        const attenuation = this.attenuation

        const queue = [{ x: startX, y: startY, z: startZ, luminosity: startLuminosity, axis: startAxis}];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, luminosity, axis } = queue.shift();
            const key = `${x},${y},${z}`;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, dir] of directions) {
                const [nx, ny, nz] = [x + dx, y + dy, z + dz];
                const hasBlock = this.hasBlock(nx, ny, nz);
                if (hasBlock) {this.addLight(nx, ny, nz, shadow ? -luminosity : luminosity, -dir)};
                const transparency = hasBlock ? 1 - (this.solidArray[this.getBlock(nx, ny, nz)] / 10.) : 1
                const fallOff = (dir == axis) ? 1. : attenuation
                const newluminosity = (luminosity - fallOff) * transparency;
                if (newluminosity > 0) {
                    queue.push({ x: nx, y: ny, z: nz, luminosity: newluminosity, axis: dir })
                }
            }
        }
    }

    async chunkLight(cx, cy) {
        for (const [x, y, z, luminosity, axis] of this.lightSourceMap.get(cx)?.get(cy) ?? []) {
            await this.propagateLight(x, y, z, luminosity, axis);
        }

        const size = this.chunkSize**2;
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const z = this.getSkyLight(dx + cx * size, dy + cy * size);
                await this.propagateLight(dx + cx * size, dy + cy * size, z + 1, this.sunLuminosity, this.sunAxis);
            }
        }
        this.SetChunkLoadState(cx, cy, 2)
    }

    getAffectedSources(x, y, z) {
        const [centerX, centerY] = this.roundChunk(x, y);
        const lightSourceArray = [];
        const attenuation = this.attenuation
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cx = dx + centerX
                const cy = dy + centerY
                const cyMap = this.lightSourceMap.get(cx)?.get(cy);
                if (!cyMap) continue;

                for (let i = cyMap.length - 1; i >= 0; i--) {
                    const [lx, ly, lz, luminosity, axis] = cyMap[i];
                    const dx = lx - x;
                    const dy = ly - y;
                    const dz = lz - z;
                    const dist = dx + dy + dz;
                    const turns = (dx > 0) + (dy > 0) + (dz > 0) - 1;
                    const effectiveLight = luminosity - (dist + attenuation * turns);
                    if (effectiveLight >= 0) {
                        lightSourceArray.push([lx, ly, lz, luminosity, axis]);
                    }
                }
            }
        }
        return lightSourceArray;
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
        return Math.min(Math.exp(h) / 10, 1);
    }

    async createTree(x, y, z) {
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

    async createChunk(cx, cy) {
        const size = this.chunkSize**2;
        
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const x = dx + cx * size;
                const y = dy + cy * size;
                this.setBlock(x, y, 1, 3); //dirt
                this.setBlock(x, y, 2, 1); //water
                
                let h = Math.round(this.noise(x, y) * this.worldHeight);
                
                const mountainThreshold = this.worldHeight * 0.5;
                if (h > mountainThreshold) {
                    for (let z = 0; z < h; z++) {
                        this.setBlock(x, y, z, 5); //stone
                    }
                } 
                if ((1 < h) && (h < mountainThreshold)) {
                    for (let z = 0; z < h; z++) {
                        this.setBlock(x, y, z, 3); //dirt
                    }
                    this.setBlock(x, y, h, 2); //grass
                    if (Math.random() < 0.01) {
                        if (Math.random() < 0.1) {
                            this.setBlock(x, y, h + 1, 6) //torch
                            this.setLightSource(x, y, h + 1, 16)
                        }
                        else {await this.createTree(x, y, h + 1)}
                    }

                }
            }
        }
    }

    placeBlock() {
        if (this.dtBlockPlaced >= this.blockPlaceTime) {this.dtBlockPlaced -= this.blockPlaceTime}
        else {return};
        if (this.EnqueuedBlock.length == 0) {return};

        const [x, y, z, block] = this.EnqueuedBlock;
        const [cx, cy] = this.roundChunk(x, y)
        if (!this.hasChunk(cx, cy)) {return};
        this.EnqueuedBlock = [];
        const lightSourceArray = this.getAffectedSources(x, y, z);
        for (const [x, y, z, luminosity, axis] of lightSourceArray) {this.propagateLight(x, y, z, luminosity, axis, true);};
        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                const z = this.getSkyLight(x + dx, y + dy)
                this.propagateLight(x + dx, y + dy, z + 1, this.sunLuminosity, this.sunAxis, true)
            }
        }
        if (block) {this.setBlock(x, y, z, block)} else {this.deleteBlock(x, y, z)};
        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                const z = this.getSkyLight(x + dx, y + dy)
                this.propagateLight(x + dx, y + dy, z + 1, this.sunLuminosity, this.sunAxis)
            }
        }
        for (const [x, y, z, luminosity, axis] of lightSourceArray) {this.propagateLight(x, y, z, luminosity, axis);};
        this.sortBlocks()
    }

    interact(mx, my, key) {
        const hoverBlock = this.getHoveredBlock(mx, my)
        if (hoverBlock) {
            const [x, y, z, block, axis] = hoverBlock
            if (key == "place") {
                if (axis == 0) {this.EnqueuedBlock = [x + 1, y, z, 5]}
                if (axis == 1) {this.EnqueuedBlock = [x, y + 1, z, 5]}
                if (axis == 2) {this.EnqueuedBlock = [x, y, z + 1, 5]}
            } else if (key == "break") {
                this.EnqueuedBlock = [x, y, z, false]
            }
        }
    }

    getHoveredBlock(mx, my) {
        const o = this.offset
        const w = this.width
        const h = this.height

        for (let i = this.blocksArray.length - 1; i >= 0; i--) {
            const [x, y, z, block, _, isoX, isoY] = this.blocksArray[i];
            if (
                (mx >= isoX) &&
                (mx <= isoX + w) &&
                (my >= isoY) &&
                (my <= isoY + h)
            ) {
                const dx = mx - isoX
                const dy = my - isoY
                if ((dy >= o) && (dx >= (w / 2))) { //x area
                    if (this.triangle(dx, dy, [w / 2, 2 * o], [w / 2, o], [w, o])) { //top x-triangle
                        return [x, y, z, block, 2];
                    } else if (this.triangle(dx, dy, [w / 2, h], [w, h - o], [w, h])) { //bottom x-triangle
                        continue;
                    } else { //x face
                        return [x, y, z, block, 0];
                    }
                } else if ((dy >= o) && (dx <= (w / 2))) { //y area
                    if (this.triangle(dx, dy, [0, o], [w / 2, o], [w / 2, 2 * o])) { //top y-triangle
                        return [x, y, z, block, 2];
                    } else if (this.triangle(dx, dy, [0, h], [0, h - o], [w / 2, h])) { //bottom y-triangle
                        continue;
                    } else { //y face
                        return [x, y, z, block, 1];
                    }
                } else { //z area
                    if (this.triangle(dx, dy, [0, 0], [w / 2, 0], [0, o])) { //left z-triangle
                        continue;
                    } else if (this.triangle(dx, dy, [w / 2, 0], [w, 0], [w, o])) { //right z-triangle
                        continue;
                    } else { //z face
                        return [x, y, z, block, 2];
                    }              
                }
            }
        }
        return null;
    }

    sign(p1, p2, p3) {
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    }
    
    triangle(dx, dy, a, b, c) { //clockwise
        const p = [dx, dy];
        const d1 = this.sign(p, a, b);
        const d2 = this.sign(p, b, c);
        const d3 = this.sign(p, c, a);

        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

        return !(hasNeg && hasPos);
    }

    async tick() {
        this.dt -= this.tickTime

        await arcade.updateChunks();
        await arcade.sortBlocks();

        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, block] of zMap) {
                        }
                    }
                }
            }
        }
    }

    update(dt) {
        this.dt += dt
        this.dtBlockPlaced += dt

        this.camera[0] += this.camDirection[0] * this.CameraSpeed * dt;
        this.camera[1] += this.camDirection[1] * this.CameraSpeed * dt;

        if (this.dt >= this.tickTime) {
            this.dt -= this.tickTime
            this.tick()
        }

        this.placeBlock();
        arcade.updateBlocks()
        arcade.draw();
    }
}

const textureSheet = new Image();
textureSheet.crossOrigin = 'anonymous';
textureSheet.src = 'assets/texture_sheet.png';

const textureArray = [
    [0, 0], //leaves 0
    [0, 1], //water 1
    [[1,1], [1, 2], [1,0]], //grass 2
    [[1,4], [1, 5], [1,3]], //dirt 3
    [[2,1], [2, 2], [2,0]], //wood 4
    [[2,4], [2, 5], [2,3]], //stone 5
    [0, 2] //torch 6
];

const solidArray = [0, 8, 10, 10, 10, 10, 0];
const arcade = new IsoArcade(4, 16, 16, textureArray, solidArray);
arcade.diagnostics = false

await arcade.init("game");
await arcade.setTexture(textureSheet);

const centerX = arcade.canvas.width / 2;
const centerY = arcade.canvas.height / 2;

let keyW = false;
let keyS = false;
let keyA = false;
let keyD = false;

let mx = 0
let my = 0
let press = false

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

document.addEventListener('mousemove', function (e) {
    const rect = arcade.canvas.getBoundingClientRect();
    mx = e.clientX;
    my = e.clientY;
});

window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {arcade.interact(mx, my, "break")} 
    else if (e.button === 2) {arcade.interact(mx, my, "place")}

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
        arcade.camDirection = [dx, dy]
    } else {arcade.camDirection = [0, 0]}

    arcade.update(dt / 1000)
    gameLoop.lastTime = timestamp;

    if (arcade.diagnostics) {
        const fps = (1000 / dt).toFixed(2);
        console.log("fps:", fps);
    }
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);