const canvas = document.getElementById('game');
if (!canvas) throw new Error('Canvas not found');

const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format });

// === Load Texture ===
const textureSheet = new Image();
textureSheet.src = 'assets/pixel_art/texture_sheet.png';
await textureSheet.decode();

const imageBitmap = await createImageBitmap(textureSheet);
const texture = device.createTexture({
  size: [imageBitmap.width, imageBitmap.height, 1],
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
});
device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: texture },
  [imageBitmap.width, imageBitmap.height]
);

// === Define Block Source Rect ===
const sx = 0, sy = 0, sw = 16, sh = 16;
const texW = imageBitmap.width;
const texH = imageBitmap.height;

const u0 = sx / texW, v0 = sy / texH;
const u1 = (sx + sw) / texW, v1 = (sy + sh) / texH;

// === Vertex Data (pos.xy + uv.xy) ===
const vertexData = new Float32Array([
  //   x,    y,   u,   v
   -0.5,  0.5, u0, v0,
   -0.5, -0.5, u0, v1,
    0.5,  0.5, u1, v0,
    0.5, -0.5, u1, v1,
]);

const vertexBuffer = device.createBuffer({
  size: vertexData.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(vertexBuffer, 0, vertexData);

const indexData = new Uint16Array([
  0, 1, 2,
  2, 1, 3
]);

const indexBuffer = device.createBuffer({
  size: indexData.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
});
device.queue.writeBuffer(indexBuffer, 0, indexData);

// === Shaders ===
const vertexShader = `
  struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f
  };

  @vertex
  fn main(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VertexOut {
    var out: VertexOut;
    out.pos = vec4f(pos, 0.0, 1.0);
    out.uv = uv;
    return out;
  }
`;

const fragmentShader = `
  @group(0) @binding(0) var mySampler: sampler;
  @group(0) @binding(1) var myTexture: texture_2d<f32>;

  @fragment
  fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return textureSample(myTexture, mySampler, uv);
  }
`;

// === Pipeline ===
const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({ code: vertexShader }),
    entryPoint: 'main',
    buffers: [{
      arrayStride: 16,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // pos
        { shaderLocation: 1, offset: 8, format: 'float32x2' }  // uv
      ]
    }]
  },
  fragment: {
    module: device.createShaderModule({ code: fragmentShader }),
    entryPoint: 'main',
    targets: [{ format }]
  },
  primitive: { topology: 'triangle-list' }
});

// === Bind Group ===
const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: sampler },
    { binding: 1, resource: texture.createView() }
  ]
});

// === Draw ===
const commandEncoder = device.createCommandEncoder();
const textureView = context.getCurrentTexture().createView();
const renderPass = commandEncoder.beginRenderPass({
  colorAttachments: [{
    view: textureView,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear',
    storeOp: 'store'
  }]
});
renderPass.setPipeline(pipeline);
renderPass.setBindGroup(0, bindGroup);
renderPass.setVertexBuffer(0, vertexBuffer);
renderPass.setIndexBuffer(indexBuffer, 'uint16');
renderPass.drawIndexed(6, 1, 0, 0, 0);
renderPass.end();
device.queue.submit([commandEncoder.finish()]);
