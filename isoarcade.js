class IsoArcade {
    constructor(offset, width, height, textureArray, solidArray, luminosityArray) {       
        // User defined
        this.offset = offset;
        this.width = width;
        this.height = height;
        this.textureArray = textureArray;
        this.solidArray = solidArray;
        this.luminosityArray = luminosityArray;

        // Preset values
        this.maxLight = 16;
        this.sunLuminosity = 4;
        this.sunSelfLuminosity = 4;
        this.sunAxis = "z";
        this.sunDirection = -1;
        this.attenuation = 2;
        this.fogScale = 200;
        this.chunkSize = 4; //root of actual size
        this.diagnostics = false;
        this.direction = {x: 1, y: 1, z: 1}
        this.renderDistance = 7;
        this.worldHeight = 30;
        this.minLight = 3
        this.tickPerSecond = 5;
        this.voxelsPerSecond = 10;
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
        this.voxelPlaceTime = 1 / this.voxelsPerSecond;
        this.tickTime = (1 / this.tickPerSecond)

        // Data storage
        this.spriteCount = 0;
        this.dt = 0;
        this.dtVoxelPlaced = 0;
        this.voxelsMap = new Map();
        this.lightMap = new Map();
        this.lightSourceMap = new Map();
        this.chunkLoadState = new Map();
        this.camera = [0, 0];
        this.cameraDirection = [0, 0];
        this.voxelsArray = [];
        this.enqueuedVoxel= [];
        this.rotateDirection = false
    }

    async init(id, initialCapacity = 10000) {
        this.canvas = document.getElementById(id);
        if (!this.canvas) throw new Error('Canvas not found');

        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        this.canvas.style.imageRendering = 'pixelated';

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

        const quadVertices = new Float32Array([
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

        this.uniformBuffer = this.device.createBuffer({
            size: 16,
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

    async initWorld(){
        for (let cx = -30; cx <= 30; cx++) {
            for (let cy = 30; cy <= 30; cy++) {
                this.loadChunk(cx, cy)
            }
        }
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

    getChunk(cx, cy) {
        return this.voxelsMap.get(cx)?.get(cy);
    }

    hasChunk(cx, cy) {
        return this.getChunk(cx, cy) !== undefined;
    }

    roundChunk(x, y) {
        const cx = x >> this.chunkSize;
        const cy = y >> this.chunkSize;
        return [cx, cy]
    }

    getVoxel(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        return this.getChunk(cx, cy)?.get(x)?.get(y)?.get(z);
    }

    hasVoxel(x, y, z) {
        return this.getVoxel(x, y, z) !== undefined;
    }

    setVoxel(x, y, z, voxel) {
        if (voxel == null) {return};
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.voxelsMap.has(cx)) this.voxelsMap.set(cx, new Map());
        const cyMap = this.voxelsMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        yMap.get(y).set(z, voxel);
        const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[voxel];
        this.setLightSource(x, y, z, luminosity, axis, direction, selfLuminosity);
    }

    deleteVoxel(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y)
        this.getChunk(cx, cy)?.get(x)?.get(y)?.delete(z);
    }

    getSkyLight(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        const pillar = this.getChunk(cx, cy)?.get(x)?.get(y);
        return pillar ? Math.max(...pillar.keys()): null;
    }

    addLight(x, y, z, luminosity, axis, direction) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightMap.has(cx)) this.lightMap.set(cx, new Map());
        const cyMap = this.lightMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, new Map());
        const chunk = cyMap.get(cy);

        if (!chunk.has(x)) chunk.set(x, new Map());
        const yMap = chunk.get(x);
        if (!yMap.has(y)) yMap.set(y, new Map());
        const zMap = yMap.get(y);
        if (!zMap.has(z)) {
            zMap.set(z, {
                x: { "1": 0.01, "-1": 0.01 },
                y: { "1": 0.01, "-1": 0.01 },
                z: { "1": 0.01, "-1": 0.01 },
            });
        }
        const light = zMap.get(z);
        light[axis][direction] += luminosity;
    }

    getLight(x, y, z) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightMap.get(cx)?.get(cy)?.get(x)?.get(y)?.get(z);
    }

    setLightSource(x, y, z, luminosity, axis, direction, selfLuminosity) {
        const [cx, cy] = this.roundChunk(x, y);
        if (!this.lightSourceMap.has(cx)) this.lightSourceMap.set(cx, new Map());
        const cyMap = this.lightSourceMap.get(cx);
        if (!cyMap.has(cy)) cyMap.set(cy, []);
        const lightSourceArray = cyMap.get(cy);
        lightSourceArray.push([x, y, z, luminosity, axis, direction, selfLuminosity])
    }

    getLightSources(x, y) {
        const [cx, cy] = this.roundChunk(x, y);
        return this.lightSourceMap.get(cx)?.get(cy);
    }

    async sortVoxels() {
        const cxOffset = -this.renderDistance + this.roundChunk(this.camera[0], this.camera[1])[0]
        const cyOffset = -this.renderDistance + this.roundChunk(this.camera[0], this.camera[1])[1]
        const solidArray = this.solidArray;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const camX = this.camera[0];
        const camY = this.camera[1];
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;
        const canvasBorderX = this.width * this.CameraSpeed / this.tickPerSecond;
        const canvasBorderY = this.height * this.CameraSpeed / this.tickPerSecond;
        const xAxis = this.direction.x;
        const yAxis = this.direction.y;
        const zAxis = this.direction.z;
        const xFactor = this.width / 2;
        const yFactorZ = this.height - 2 * this.offset;
        const yFactor = this.offset;

        const visibilityMap = new Map();
        const nonSolid = [];

        const encodeKey = (dy, dz) => ((dy + 1024) << 12) | (dz + 1024);

        for (let cx = cxOffset; cx <= cxOffset + 2 * this.renderDistance; cx++) {
            for (let cy = cyOffset; cy <= cyOffset + 2 * this.renderDistance; cy++) {
                const chunk = this.getChunk(cx, cy);
                if (!chunk) continue;
                for (const [x, yMap] of chunk) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, voxel] of zMap) {
                            const worldX = (x - camX) * xAxis;
                            const worldY = (y - camY) * yAxis;
                            const worldZ = (z) * zAxis;
                            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
                            const isoY = Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);

                            if (isoX + canvasBorderX < 0 || isoY + canvasBorderY < 0 || isoX - canvasBorderX > canvasWidth || isoY - canvasBorderY > canvasHeight) continue;

                            const magnitude = worldX + worldY + worldZ;
                            const dy = worldY - worldX;
                            const dz = worldZ - worldX;
                            const key = encodeKey(dy, dz);

                            if (solidArray[voxel] === 10) {
                                const existing = visibilityMap.get(key);
                                if (!existing || magnitude > existing[4]) {
                                    visibilityMap.set(key, [x, y, z, voxel, magnitude, isoX, isoY]);
                                }
                            } else {
                                nonSolid.push([x, y, z, voxel, magnitude, isoX, isoY, key]);
                            }
                        }
                    }
                }
            }
        }

        const filtered = [];
        for (const [x, y, z, voxel, magnitude, isoX, isoY, key] of nonSolid) {
            const existing = visibilityMap.get(key);
            if (!existing || magnitude > existing[4]) {
                filtered.push([x, y, z, voxel, magnitude, isoX, isoY]);
            }
        }

        const voxelsArray = [...visibilityMap.values(), ...filtered];
        voxelsArray.sort((a, b) => ((a[2] - b[2]) * zAxis) || ((a[0] * xAxis + a[1] * yAxis) - (b[0] * xAxis+ b[1] * yAxis)));
        this.voxelsArray = voxelsArray;
    }

    updateVoxels() {
        const camX = this.camera[0];
        const camY = this.camera[1];
        const camHalfWidth = this.canvas.width / 2;
        const camHalfHeight = this.canvas.height / 2;

        const xAxis = this.direction.x
        const yAxis = this.direction.y
        const zAxis = this.direction.z

        const xFactor = this.width / 2;
        const yFactorZ = this.height - 2 * this.offset;
        const yFactor = this.offset;

        for (let i = 0; i < this.voxelsArray.length; i++) {
            const [x, y, z, voxel, magnitude] = this.voxelsArray[i];
            const worldX = (x - camX) * xAxis;
            const worldY = (y - camY) * yAxis;
            const worldZ = (z) * zAxis;
            const isoX = Math.ceil(xFactor * (worldX - worldY) + camHalfWidth);
            const isoY = Math.ceil(-worldZ * yFactorZ + (worldX + worldY) * yFactor + camHalfHeight);
            this.voxelsArray[i][5] = isoX;
            this.voxelsArray[i][6] = isoY;
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

        const baseLight = {
            x: { "1": 0.01, "-1": 0.01 },
            y: { "1": 0.01, "-1": 0.01 },
            z: { "1": 0.01, "-1": 0.01 },
        }

        const minLight = this.minLight
        const maxLight = this.maxLight

        for (const [x, y, z, voxel, magnitude, isoX, isoY] of this.voxelsArray) {
            if (isoX + w < 0 || isoY + h < 0 || isoX - w > canvasWidth || isoY - h > canvasHeight) continue;
            const fog = Math.min(1, Math.abs(x - camX + y - camY) / this.fogScale)**2
            const light = this.getLight(x, y, z) || baseLight;
            if (this.solidArray[voxel] == 10) {
                const texture = this.textureArray[voxel];
                for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) {
                    const direction = this.direction[axis];
                    const [ix, iy] = texture[index];
                    const sx = ix * sw;
                    const sy = iy * sh;
                    const brightness = Math.min(1, Math.max(minLight, light[axis][direction]) / maxLight);
                    this.drawImage(isoX, isoY, sx, sy, w, h, brightness, fog);
                    drawCount++;
                }
            } else {
                const [ix, iy] = this.textureArray[voxel];
                const sx = ix * sw;
                const sy = iy * sh;
                const maxLuminosity = Math.max(
                    light.x["1"], light.x["-1"],
                    light.y["1"], light.y["-1"],
                    light.z["1"], light.z["-1"]
                );
                const brightness = Math.min(1, Math.max(minLight, maxLuminosity) / maxLight);
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
        await this.createChunk(cx, cy);
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

                    if (neighborsLoaded) {await this.chunkLight(cx, cy)};
                };
            }
        }
        if (this.diagnostics) {
            const updateChunksTime = (performance.now() - startTime).toFixed(2);
            console.log("Update chunks took:", updateChunksTime);
        }
    }

    propagateLight(startX, startY, startZ, startLuminosity, startAxis, startDirection, selfLuminosity, shadow) {
        const attenuation =  this.attenuation

        const directions = [ //x, y, z, axis, direction
            [1, 0, 0, "x", 1],
            [0, 1, 0, "y", 1],
            [0, 0, 1, "z", 1],
            [-1, 0, 0, "x", -1],
            [0, -1, 0, "y", -1],
            [0, 0, -1, "z", -1]
        ];

        if (selfLuminosity) {
            for (const [dx, dy, dz, axis, direction] of directions) {
                const [nx, ny, nz] = [startX + dx, startY + dy, startZ + dz];
                const voxelExists = this.hasVoxel(nx, ny, nz);
                if (voxelExists) this.addLight(nx, ny, nz, shadow ? -selfLuminosity : selfLuminosity, axis, -direction);
            }
        }

        const queue = [{ x: startX, y: startY, z: startZ, luminosity: startLuminosity, axis: startAxis, direction: startDirection }];
        const visited = new Set();

        while (queue.length > 0) {
            const { x, y, z, luminosity, axis, direction } = queue.shift();
            const key = `${x},${y},${z}`;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const [dx, dy, dz, newAxis, newDirection] of directions) {
                const [nx, ny, nz] = [x + dx, y + dy, z + dz];
                const voxelExists = this.hasVoxel(nx, ny, nz);
                if (voxelExists) this.addLight(nx, ny, nz, shadow ? -luminosity : luminosity, newAxis, -newDirection);

                const transparency = voxelExists ? 1 - (this.solidArray[this.getVoxel(nx, ny, nz)] / 10) : 1;
                const fallOff = (newAxis == axis) && (newDirection == direction) ? 1 : attenuation;
                const newLuminosity = (luminosity - fallOff) * transparency;

                if (newLuminosity > 0) {
                    queue.push({ x: nx, y: ny, z: nz, luminosity: newLuminosity, axis: axis, direction: newDirection });
                }
            }
        }
    }

    async chunkLight(cx, cy) {
        const lightSources = this.lightSourceMap.get(cx)?.get(cy) ?? [];
        await Promise.all(
            lightSources.map(([x, y, z, luminosity, axis, direction, selfLuminosity]) =>
                this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity)
            )
        );

        const size = this.chunkSize ** 2;
        const promises = [];
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const z = this.getSkyLight(dx + cx * size, dy + cy * size);
                promises.push(
                    this.propagateLight(dx + cx * size, dy + cy * size, z + 1, this.sunLuminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity, false)
                );
            }
        }
        await Promise.all(promises);

        this.SetChunkLoadState(cx, cy, 2);
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
                    const [lx, ly, lz, luminosity, axis, direction, selfLuminosity] = cyMap[i];
                    const dx = lx - x;
                    const dy = ly - y;
                    const dz = lz - z;
                    const dist = dx + dy + dz;
                    const turns = (dx > 0) + (dy > 0) + (dz > 0) - 1;
                    const effectiveLight = luminosity - (dist + attenuation * turns);
                    if (effectiveLight >= 0) {
                        lightSourceArray.push([lx, ly, lz, luminosity, axis, direction, selfLuminosity]);
                    }
                }
            }
        }
        return lightSourceArray;
    }

    async placeVoxel() {
        if (this.dtVoxelPlaced < this.voxelPlaceTime) {return};
        this.dtVoxelPlaced -= this.voxelPlaceTime
        if (this.enqueuedVoxel.length == 0) {return};

        const [px, py, pz, voxel] = this.enqueuedVoxel;
        const [cx, cy] = this.roundChunk(px, py);
        if (!this.hasChunk(cx, cy)) {return};
        this.enqueuedVoxel = [];

        const lightSourceArray = this.getAffectedSources(px, py, pz);
        for (const [x, y, z, luminosity, axis, direction, selfLuminosity] of lightSourceArray) {
            if (luminosity == 0) {continue};
            this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity, true);
        }
        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                const z = this.getSkyLight(px + dx, py + dy);
                this.propagateLight(px + dx, py + dy, z + 1, this.sunLuminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity, true);
            }
        }

        if (voxel) {
            this.setVoxel(px, py, pz, voxel);
            const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[voxel];
            this.propagateLight(px, py, pz, luminosity, axis, direction, selfLuminosity, false);
        } else {
            const deletedVoxel = this.getVoxel(px, py, pz)
            this.deleteVoxel(px, py, pz);
            const [luminosity, axis, direction, selfLuminosity] = this.luminosityArray[deletedVoxel];
            this.propagateLight(px, py, pz, luminosity, axis, direction, selfLuminosity, true);
        }

        for (const [x, y, z, luminosity, axis, direction, selfLuminosity] of lightSourceArray) {
            if (luminosity == 0) {continue};
            this.propagateLight(x, y, z, luminosity, axis, direction, selfLuminosity, false);
        };

        for (let dx = -this.sunLuminosity; dx <= this.sunLuminosity; dx++) {
            for (let dy = -this.sunLuminosity; dy <= this.sunLuminosity; dy++) {
                const z = this.getSkyLight(px + dx, py + dy);
                this.propagateLight(px + dx, py + dy, z + 1, this.sunLuminosity, this.sunAxis, this.sunDirection, this.sunSelfLuminosity, false);
            }
        }
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

    createTree(x, y, z) {
        const trunkHeight = 10 + Math.floor(Math.random() * 20);
        const branchLength = 4 + Math.floor(Math.random() * 3);
        const canopyRadius = 5 + Math.floor(Math.random() * 3);

        // Trunk (vertical logs)
        for (let dz = 0; dz < trunkHeight; dz++) {
            this.setVoxel(x, y, z + dz, 4)
            // Slight trunk thickness
            if (dz < trunkHeight - 4) {
                this.setVoxel(x + 1, y, z + dz, 4)
                this.setVoxel(x - 1, y, z + dz, 4)
                this.setVoxel(x, y + 1, z + dz, 4)
                this.setVoxel(x, y - 1, z + dz, 4)
            }
        }

        // Branches (multiple, extending from upper trunk)
        const branchHeights = [trunkHeight - 5, trunkHeight - 7, trunkHeight - 9]
        const branchDirs = [
            [1, 0], [-1, 1], [0, -1],
            [1, 1], [-1, -1]
        ]

        for (const bh of branchHeights) {
            for (const [dxDir, dyDir] of branchDirs) {
                for (let i = 1; i <= branchLength; i++) {
                    const bx = x + dxDir * i
                    const by = y + dyDir * i
                    const bz = z + bh
                    this.setVoxel(bx, by, bz, 4)
                }
            }
        }

        // Leaves canopy (big sphere over trunk top)
        for (let dx = -canopyRadius; dx <= canopyRadius; dx++) {
            for (let dy = -canopyRadius; dy <= canopyRadius; dy++) {
                for (let dzOff = 0; dzOff <= canopyRadius * 2; dzOff++) {
                    const dzPos = z + trunkHeight + dzOff - canopyRadius
                    const dist = Math.sqrt(dx * dx + dy * dy + (dzOff - canopyRadius) * (dzOff - canopyRadius))
                    if (dist <= canopyRadius + 0.5 && dist >= canopyRadius - 3) {
                        this.setVoxel(x + dx, y + dy, dzPos, 0)
                    }
                }
            }
        }

        // Leaves on branches ends (small clusters)
        for (const bh of branchHeights) {
            for (const [dxDir, dyDir] of branchDirs) {
                const bx = x + dxDir * branchLength
                const by = y + dyDir * branchLength
                const bz = z + bh
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dzOff = 0; dzOff <= 3; dzOff++) {
                            const dist = Math.abs(dx) + Math.abs(dy) + dzOff
                            if (dist <= 4) {
                                this.setVoxel(bx + dx, by + dy, bz + dzOff, 0)
                            }
                        }
                    }
                }
            }
        }
    }

    async createChunk(cx, cy) {
        const size = this.chunkSize**2;

        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                const x = dx + cx * size;
                const y = dy + cy * size;
                this.setVoxel(x, y, 1, 12); //sand
                this.setVoxel(x, y, 2, 1); //water
                
                let h = Math.round(this.noise(x, y) * this.worldHeight);
                
                const mountainThreshold = this.worldHeight * 0.5;
                if (h > mountainThreshold) {
                    for (let z = 0; z < h; z++) {
                        this.setVoxel(x, y, z, 5); //stone
                    }
                } 
                else if (h > 1) {
                    for (let z = 0; z < h; z++) {
                        this.setVoxel(x, y, z, 3);
                    }
                    const random = Math.random()
                    if (h == 2) {
                            this.setVoxel(x, y, h, 12); //sand
                            if (random < 0.01) this.setVoxel(x, y, h + 1, 7); //root
                        } else {
                            this.setVoxel(x, y, h, 2); //grass
                            if (random < 0.0005) {
                                this.createTree(x, y, h + 1)
                            } else if (random < 0.02) {
                                this.setVoxel(x, y, h + 1, 8); //grass
                            } else if (random < 0.03) {
                                this.setVoxel(x, y, h + 1, 9); //plant
                            } else if (random < 0.04) {
                                this.setVoxel(x, y, h + 1, 10); //plant
                            } else if (random < 0.05) {
                                this.setVoxel(x, y, h + 1, 11); //plant
                            }
                        }
                }
            }
        }
    }

    interact(mx, my, key) {
        const hoverVoxel = this.getHoveredVoxel(mx, my)
        if (hoverVoxel) {
            const [x, y, z, voxel, axis] = hoverVoxel
            if (key == "place") {
                if (axis == 0) {this.enqueuedVoxel= [x + this.direction.x, y, z, 6]}
                if (axis == 1) {this.enqueuedVoxel= [x, y + this.direction.y, z, 6]}
                if (axis == 2) {this.enqueuedVoxel= [x, y, z + this.direction.z, 6]}
            } else if (key == "break") {
                this.enqueuedVoxel= [x, y, z, false]
            }
        }
    }

    getHoveredVoxel(mx, my) {
        const o = this.offset
        const w = this.width
        const h = this.height

        for (let i = this.voxelsArray.length - 1; i >= 0; i--) {
            const [x, y, z, voxel, _, isoX, isoY] = this.voxelsArray[i];
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
                        return [x, y, z, voxel, 2];
                    } else if (this.triangle(dx, dy, [w / 2, h], [w, h - o], [w, h])) { //bottom x-triangle
                        continue;
                    } else { //x face
                        return [x, y, z, voxel, 0];
                    }
                } else if ((dy >= o) && (dx <= (w / 2))) { //y area
                    if (this.triangle(dx, dy, [0, o], [w / 2, o], [w / 2, 2 * o])) { //top y-triangle
                        return [x, y, z, voxel, 2];
                    } else if (this.triangle(dx, dy, [0, h], [0, h - o], [w / 2, h])) { //bottom y-triangle
                        continue;
                    } else { //y face
                        return [x, y, z, voxel, 1];
                    }
                } else { //z area
                    if (this.triangle(dx, dy, [0, 0], [w / 2, 0], [0, o])) { //left z-triangle
                        continue;
                    } else if (this.triangle(dx, dy, [w / 2, 0], [w, 0], [w, o])) { //right z-triangle
                        continue;
                    } else { //z face
                        return [x, y, z, voxel, 2];
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
        if (this.dt < this.tickTime) {return};
        this.dt -= this.tickTime;

        this.placeVoxel();

        if (this.rotateDirection) {
            const x = this.direction.x;
            const y = this.direction.y;
            this.direction.x = y;
            this.direction.y = -x;
            console.log(this.direction)
            this.rotateDirection = false;
        }

        await arcade.updateChunks();
        await arcade.sortVoxels();

        const [cxCam, cyCam] = this.roundChunk(this.camera[0], this.camera[1]);
        for (let cx = -this.renderDistance + cxCam; cx <= this.renderDistance + cxCam; cx++) {
            for (let cy = -this.renderDistance + cyCam; cy <= this.renderDistance + cyCam; cy++) {
                for (const [x, yMap] of this.getChunk(cx, cy)) {
                    for (const [y, zMap] of yMap) {
                        for (const [z, voxel] of zMap) {
                        }
                    }
                }
            }
        }
    }

    update(dt) {
        this.dt += dt;
        this.dtVoxelPlaced += dt;

        this.camera[0] += this.direction.x * this.cameraDirection[0] * this.CameraSpeed * dt;
        this.camera[1] += this.direction.y * this.cameraDirection[1] * this.CameraSpeed * dt;

        this.updateVoxels();
        this.draw();
    }
}

const textureSheet = new Image();
textureSheet.crossOrigin = 'anonymous';
textureSheet.src = 'assets/images/pixel_art/texture_sheet.png';

const textureArray = [
    [0, 0], //leaves 0
    [0, 1], //water 1
    [[1,1], [1, 2], [1,0]], //grass 2
    [[1,4], [1, 5], [1,3]], //dirt 3
    [[2,1], [2, 2], [2,0]], //wood 4
    [[2,4], [2, 5], [2,3]], //stone 5
    [0, 2], //torch 6
    [0, 3], //root 7
    [0, 4], //grass 8
    [0, 5], //plant 9
    [0, 6], //plant 10
    [0, 7], //plant 11
    [[3,1], [3, 2], [3,0]], //sand 12
];

const solidArray = [0, 4, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0, 10];
const luminosityArray = [ //startLuminosity, startAxis, startDirection, selfLuminosity
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [16, 4, 0, 0],
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0], 
    [0, 0, 0, 0],
    [0, 0, 0, 0],
];

const arcade = new IsoArcade(4, 16, 16, textureArray, solidArray, luminosityArray);
arcade.diagnostics = false

await arcade.init("game");
await arcade.setTexture(textureSheet);
await arcade.initWorld();

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
    if (e.key === 'q') arcade.rotateDirection = true;
});

document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
});

window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {arcade.interact(mx, my, "break")} 
    else if (e.button === 2) {arcade.interact(mx, my, "place")}

});

let fpsSum = 0;
let fpsCount = 0;
function gameLoop(timestamp) {
    const dt = timestamp - (gameLoop.lastTime || timestamp);

    let dx = 0, dy = 0;
    if (keyW) { dx += -1; dy += -1; }
    if (keyS) { dx += 1; dy += 1; }
    if (keyA) { dx += -1; dy += 1; }
    if (keyD) { dx += 1; dy += -1; }

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        arcade.cameraDirection = [dx, dy];
    } else {arcade.cameraDirection = [0, 0]}

    arcade.update(dt / 1000)
    gameLoop.lastTime = timestamp;

    if (arcade.diagnostics && !dt == 0) {
        const fps = (1000 / dt);
        fpsSum += fps;
        fpsCount += 1;
        const average = fpsSum / fpsCount;
        console.log("fps:", fps.toFixed(2), "average fps:", average.toFixed(2));
    }

    requestAnimationFrame(gameLoop);
}

let lastTick = performance.now();
const tickTestInterval = 100;

async function tickLoop() {
    while (true) {
        const now = performance.now();
        if (now - lastTick >= tickTestInterval) {
            lastTick = now;
            await arcade.tick();
        }
        await new Promise(r => setTimeout(r, 0));
    }
}

tickLoop();
requestAnimationFrame(gameLoop);