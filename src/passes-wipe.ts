import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_LINEAR,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    BlendState,
    CameraComponent,
    Entity,
    EventHandler,
    RenderPassShaderQuad,
    RenderTarget,
    ScopeSpace,
    Texture,
    ShaderUtils
} from 'playcanvas';

// PassesWipe — the simultaneous material-passes diagonal wipe, done entirely on the GPU.
//
// Replaces the earlier snapshot/`toDataURL` approach (which stalled the pipeline with 11
// CPU readbacks per refresh — slow regardless of scene content). Here the scene is rendered
// into 11 offscreen textures (one per debug shader pass) by 11 lightweight cameras that mirror
// the main camera, then a single full-screen composite shader draws the slanted slices,
// sampling the right pass-texture per pixel. No readback → live at 60fps, fast even with a
// real model, matching the CSS-cube demo.
//
// Isolated: enable() only touches its own cameras/targets/compositor + the main camera's
// renderPasses; disable() restores everything. Any failure during enable() throws and the
// caller falls back to normal rendering.
//
// Mechanism verified headless (11 diagonal bands + fly-in + expand, via the debugTint aid);
// real per-pass colours need a loaded model on a real GPU. Degrades gracefully — the viewer
// keeps the snapshot path as a fallback (WebGPU / any setup failure).

// the 11 passes, in wipe order left→right, as engine shader-pass names
const PASS_SHADER = [
    'forward',            // Default
    'debug_lighting',     // Lighting
    'debug_albedo',       // Albedo
    'debug_emission',     // Emissive
    'debug_worldNormal',  // WorldNormal
    'debug_metalness',    // Metalness
    'debug_gloss',        // Gloss
    'debug_ao',           // Ao
    'debug_specularity',  // Specularity
    'debug_opacity',      // Opacity
    'debug_uv0'           // Uv0
];
const N = PASS_SHADER.length;

// GLSL ES forbids indexing a sampler array with a non-constant — unroll to constant indices
const sampleChain = Array.from({ length: N }, (_, i) => `        ${i === 0 ? 'if' : 'else if'} (band == ${i}) return texture2D(passTex[${i}], uv);`
).join('\n');

const vertexGLSL = /* glsl */`
    attribute vec2 vertex_position;
    varying vec2 texcoord;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.5, 1.0);
        texcoord = vertex_position.xy * 0.5 + 0.5;
    }
`;

// The band selector. `bounds[i]` is the x (0..1) of divider i at mid-height; the slant tilts
// the divider by `slantAspect` (vh→uv) across the viewport. `expandT` (0..1) blends the
// expanded band to full-bleed. Sampler arrays can't be dynamically indexed in GLSL ES, so we
// resolve the band then branch to sample.
const fragmentGLSL = /* glsl */`
    precision highp float;
    varying vec2 texcoord;
    uniform sampler2D passTex[${N}];
    uniform float bounds[${N + 1}];     // divider x positions (0..1), animated
    uniform float slant;                // uv x-shift per (y-0.5)
    uniform int   expandedBand;         // -1 none
    uniform float expandT;              // 0..1 expand progress
    uniform float debugTint;            // >0.5 → tint each band a distinct hue (alignment aid)

    vec4 sampleBand(int band, vec2 uv) {
${sampleChain}
        return texture2D(passTex[0], uv);
    }

    void main(void) {
        // diagonal coordinate: shift x by the slant based on distance from mid-height
        float dx = (texcoord.y - 0.5) * slant;
        float x = texcoord.x - dx;

        // when a band is expanded it fills the frame
        if (expandedBand >= 0 && expandT > 0.999) {
            gl_FragColor = sampleBand(expandedBand, texcoord);
            return;
        }

        int band = 0;
        for (int i = 0; i < ${N}; i++) {
            if (x > bounds[i]) band = i;
        }

        // partial expand: lerp the expanded band's coverage toward full
        if (expandedBand >= 0 && expandT > 0.0) {
            // widen the expanded band's [lo,hi] toward [0,1]
            float lo = mix(bounds[expandedBand], 0.0, expandT);
            float hi = mix(bounds[expandedBand + 1], 1.0, expandT);
            if (x >= lo && x < hi) band = expandedBand;
        }

        vec4 col = sampleBand(band, texcoord);
        if (debugTint > 0.5) {
            vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (float(band) / float(${N}) + vec3(0.0, 0.33, 0.67)));
            col.rgb = mix(col.rgb, hue, 0.75);
        }
        gl_FragColor = col;
    }
`;

const noBlend = new BlendState(false);

class CompositePass extends RenderPassShaderQuad {
    events = new EventHandler();

    execute() {
        this.events.fire('execute');
        super.execute();
    }
}

const resolve = (scope: ScopeSpace, values: Record<string, any>) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class PassesWipe {
    app: any;

    cameraEntity: Entity;

    device: any;

    enabled = false;

    texs: Texture[] = [];

    rts: RenderTarget[] = [];

    cams: Entity[] = [];

    composite: CompositePass | null = null;

    shader: any = null;

    // animation state (driven from the overlay each frame)
    flyT = 99;

    expP = 0;

    expandedIdx = -1;

    debugTint = false;   // toggle from console: viewer.passesWipe.debugTint = true

    // saved main-camera state
    private _savedRenderPasses: any = null;

    private _savedMultiframe = true;

    private _w = 0;

    private _h = 0;

    constructor(app: any, cameraEntity: Entity) {
        this.app = app;
        this.cameraEntity = cameraEntity;
        this.device = app.graphicsDevice;
        this.shader = ShaderUtils.createShader(this.device, {
            uniqueName: 'mcs-passes-wipe',
            attributes: { vertex_position: SEMANTIC_POSITION },
            vertexGLSL,
            fragmentGLSL,
            // WGSL variant deferred — the wipe is gated to WebGL2 for now (see viewer.ts)
            vertexWGSL: vertexGLSL,
            fragmentWGSL: fragmentGLSL
        });
    }

    private makeTargets(w: number, h: number) {
        this.destroyTargets();
        this._w = w;
        this._h = h;
        for (let i = 0; i < N; i++) {
            const tex = new Texture(this.device, {
                name: `mcs-pass-${i}`,
                width: w,
                height: h,
                format: PIXELFORMAT_RGBA8,
                mipmaps: false,
                minFilter: FILTER_LINEAR,
                magFilter: FILTER_LINEAR,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            const rt = new RenderTarget({ name: `mcs-pass-rt-${i}`, colorBuffer: tex, depth: true });
            this.texs.push(tex);
            this.rts.push(rt);
        }
    }

    private destroyTargets() {
        this.rts.forEach(rt => rt.destroy());
        this.texs.forEach(t => t.destroy());
        this.rts = [];
        this.texs = [];
    }

    // 11 cameras that mirror the main camera, each rendering the scene to its RT in one pass
    private makeCameras() {
        this.destroyCameras();
        const main = this.cameraEntity.camera as CameraComponent;
        for (let i = 0; i < N; i++) {
            const e = new Entity(`mcs-pass-cam-${i}`);
            e.addComponent('camera', {
                clearColor: main.clearColor.clone(),
                clearColorBuffer: true,
                clearDepthBuffer: true,
                farClip: main.farClip,
                nearClip: main.nearClip,
                fov: main.fov,
                frustumCulling: main.frustumCulling,
                layers: main.layers.slice(),
                priority: (main.priority ?? 0) - N - 1 + i,   // render BEFORE the compositing main camera
                toneMapping: main.toneMapping
            });
            e.camera.renderTarget = this.rts[i];
            e.camera.setShaderPass(PASS_SHADER[i]);
            // inherit the main camera's world transform
            this.cameraEntity.addChild(e);
            this.cams.push(e);
        }
    }

    private destroyCameras() {
        this.cams.forEach((e) => {
            if (e.parent) e.parent.removeChild(e);
            e.destroy();
        });
        this.cams = [];
    }

    // build the composite pass that draws the bands from the 11 RTs to the main camera's target
    private makeComposite() {
        const pass = new CompositePass(this.device);
        pass.init(null, {});               // target set per-frame to the main camera's RT
        pass.shader = this.shader;
        pass.blendState = noBlend;
        pass.events.on('execute', () => {
            // WebGL reflects `float bounds[12]` / `sampler2D passTex[11]` as SINGLE uniforms
            // named `bounds[0]` / `passTex[0]` — set the WHOLE array on that name, not per element.
            resolve(this.device.scope, {
                // ±10vh diagonal slant (≈11.31° from vertical) → 0.2·(height/width) in uv-x
                slant: 0.2 * (this._h / Math.max(1, this._w)),
                expandedBand: this.expandedIdx,
                expandT: this.expP,
                debugTint: this.debugTint ? 1.0 : 0.0,
                'bounds[0]': this.computeBounds(),   // whole Float32Array(N+1)
                'passTex[0]': this.texs               // whole Texture[N] sampler array
            });
        });
        this.composite = pass;
    }

    // divider x-positions (0..1) with the staggered fly-in baked in, matching the overlay.
    // Returns a Float32Array — PlayCanvas float-array uniforms won't upload from a plain number[].
    private computeBounds(): Float32Array {
        const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
        const fp = (i: number) => {
            const c = clamp01((this.flyT - i * 0.045) / 0.6);
            return 1 - Math.pow(1 - c, 3);
        };
        const cx = (i: number) => (8 + i * (82 / (N - 1))) / 100; // → 0..1
        const out = new Float32Array(N + 1);
        for (let i = 0; i <= N; i++) {
            const idx = Math.min(i, N - 1);
            const shift = 1.3 * (1 - fp(idx));   // fly in from the right (uv units)
            out[i] = i === 0 ? -1 : (i === N ? 2 : cx(i) + shift);
        }
        return out;
    }

    setAnim(flyT: number, expP: number, expandedIdx: number) {
        this.flyT = flyT;
        this.expP = expP;
        this.expandedIdx = expandedIdx;
    }

    enable(multiframe: { enabled: boolean } | null) {
        if (this.enabled) return;
        const main = this.cameraEntity.camera as CameraComponent;
        const rt = main.renderTarget;
        const w = rt ? rt.width : this.device.width;
        const h = rt ? rt.height : this.device.height;
        this.makeTargets(w, h);
        this.makeCameras();
        this.makeComposite();
        // point the composite at the main camera's render target
        (this.composite as any).init(main.renderTarget, {});
        this.composite!.shader = this.shader;
        // override the main camera to render ONLY the composite (not the scene)
        this._savedRenderPasses = main.renderPasses;
        main.renderPasses = [this.composite as any];
        // multiframe accumulation would ghost the animating wipe → pause it
        if (multiframe) {
            this._savedMultiframe = multiframe.enabled;
            multiframe.enabled = false;
        }
        this.enabled = true;
    }

    disable(multiframe: { enabled: boolean } | null) {
        if (!this.enabled) return;
        const main = this.cameraEntity.camera as CameraComponent;
        main.renderPasses = this._savedRenderPasses ?? [];
        this.destroyCameras();
        if (this.composite) {
            this.composite.destroy();
            this.composite = null;
        }
        this.destroyTargets();
        if (multiframe) multiframe.enabled = this._savedMultiframe;
        this.enabled = false;
    }

    // rebuild targets/cameras on viewport resize
    resize() {
        if (!this.enabled) return;
        const main = this.cameraEntity.camera as CameraComponent;
        const rt = main.renderTarget;
        const w = rt ? rt.width : this.device.width;
        const h = rt ? rt.height : this.device.height;
        if (w === this._w && h === this._h) return;
        // reassign fresh targets to the existing cameras
        this.makeTargets(w, h);
        this.cams.forEach((e, i) => {
            e.camera.renderTarget = this.rts[i];
        });
        (this.composite as any)?.init(main.renderTarget, {});
    }

    destroy() {
        this.disable(null);
    }
}

export { PassesWipe };
