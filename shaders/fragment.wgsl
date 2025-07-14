@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn main(
    @location(0) uv: vec2f,
    @location(1) brightness: f32,
    @location(2) distance: f32
) -> @location(0) vec4f {
    var color = textureSample(tex, samp, uv);
    var rgb = color.rgb * brightness;
    rgb = mix(rgb, vec3f(0.7, 0.8, 1.0), distance);
    return vec4f(rgb, color.a);
    }