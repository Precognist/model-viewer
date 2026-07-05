/**
 * renderPipeline — SHARED render-quality module (ported from @playcanvas/model-viewer, pure PC).
 *
 * The look the model-viewer gets = image-based lighting (an env atlas prefiltered from an HDR) +
 * skybox + a tonemap + one shadow-casting key light. All pure PlayCanvas (no PCUI/React), so BOTH
 * the model-viewer and this engine drive the SAME code → identical material/lighting render.
 *
 * The engine calls applyRenderPipeline(app, camera) once; the model-viewer already does the same
 * steps in viewer.ts. Env-atlas generation is verbatim from viewer.ts initSkybox().
 */
import * as pc from 'playcanvas'

export interface RenderPipelineOpts {
  envUrl?: string          // equirect HDR/PNG for IBL (default: colorful studio, like the model-viewer)
  tonemap?: number         // pc.TONEMAP_* — model-viewer default is Linear
  fov?: number             // only set if provided (leave the app's camera fov otherwise)
  skyboxIntensity?: number
  showSkybox?: boolean      // draw the env as the background (model-viewer: yes; spatial scenes: usually no)
  keyLight?: boolean        // add a shadow-casting directional key light (model-viewer default rig)
}

/** Load an equirect HDR/PNG as a Texture; RGBM-tag it if it decoded to RGBA8 (verbatim model-viewer). */
function loadEnvTexture(app: pc.AppBase, url: string): Promise<pc.Texture> {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset('env-equi', 'texture', { url })
    asset.ready(() => {
      const tex = asset.resource as pc.Texture
      if (tex.type === pc.TEXTURETYPE_DEFAULT && tex.format === pc.PIXELFORMAT_RGBA8) tex.type = pc.TEXTURETYPE_RGBM
      resolve(tex)
    })
    asset.on('error', (err: string) => reject(new Error(err)))
    app.assets.add(asset)
    app.assets.load(asset)
  })
}

/** CORE (shared by BOTH apps): prefilter a loaded equirect/cubemap Texture → scene.envAtlas + skybox.
 *  This is the model-viewer's initSkybox body, extracted so the engine and model-viewer share it. */
export function generateEnv(
  app: pc.AppBase, source: pc.Texture, opts: { skyboxIntensity?: number; showSkybox?: boolean } = {}
): { skybox: pc.Texture; envAtlas: pc.Texture } {
  const { showSkybox = true, skyboxIntensity } = opts
  const skybox = pc.EnvLighting.generateSkyboxCubemap(source)
  const lighting = pc.EnvLighting.generateLightingSource(source)
  const envAtlas = pc.EnvLighting.generateAtlas(lighting, {})
  lighting.destroy()
  app.scene.envAtlas = envAtlas
  if (showSkybox) app.scene.skybox = skybox
  if (skyboxIntensity != null) app.scene.skyboxIntensity = skyboxIntensity
  return { skybox, envAtlas }
}

/** Engine convenience: load an HDR by URL, then generateEnv. (Model-viewer already has the Texture.) */
export async function applyEnvLighting(
  app: pc.AppBase, url: string, opts: { skyboxIntensity?: number; showSkybox?: boolean } = {}
): Promise<void> {
  const source = await loadEnvTexture(app, url)
  generateEnv(app, source, opts)
}

/** Apply the full render pipeline to an app + its active camera. Idempotent (won't re-add the light). */
export async function applyRenderPipeline(app: pc.AppBase, camera: pc.Entity | null, opts: RenderPipelineOpts = {}): Promise<void> {
  const {
    envUrl = '/skybox/colorful_studio.hdr', tonemap = pc.TONEMAP_LINEAR,
    fov, skyboxIntensity = 1, showSkybox = false, keyLight = true,
  } = opts

  if (camera?.camera) {
    camera.camera.toneMapping = tonemap
    if (fov != null) camera.camera.fov = fov
  }

  if (keyLight && !app.root.findByName('__key-light')) {
    const light = new pc.Entity('__key-light')
    light.addComponent('light', {
      type: 'directional', castShadows: true, shadowBias: 0.2,
      normalOffsetBias: 0.05, shadowResolution: 2048, shadowType: pc.SHADOW_PCF3, intensity: 1,
    })
    light.setLocalEulerAngles(45, 30, 0)
    app.root.addChild(light)
  }

  try {
    await applyEnvLighting(app, envUrl, { skyboxIntensity, showSkybox })
  } catch (err) {
    console.warn('[render] env lighting failed', err)
  }
}
