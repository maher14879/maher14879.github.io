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
    @location(4) instanceSize: vec2f,
    @location(5) brightness: f32,
    @location(6) distance: f32
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) brightness: f32,
    @location(2) distance: f32
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.brightness = input.brightness;
    output.distance = input.distance;
    
    // Convert to clip space
    let pixelPos = input.position * input.instanceSize + input.instanceScreenPos;
    var clipPos = (pixelPos / uniforms.canvasSize) * 2.0 - 1.0;
    clipPos.y = -clipPos.y; // Flip Y axis
    
    output.position = vec4f(clipPos, 0.0, 1.0);
    
    // Calculate texture coordinates
    output.uv = input.uv * input.instanceSize / uniforms.textureSize + input.instanceTexPos;
    return output;
}