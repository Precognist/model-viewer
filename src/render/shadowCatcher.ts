/**
 * shadowCatcher — SHARED render module (ported verbatim from @playcanvas/model-viewer, pure PC).
 * A ground plane on its own layer that catches soft (VSM) contact shadows from the scene, so
 * objects sit on the ground instead of floating. Driven by a React wrapper that feeds it the
 * scene's shadow casters + bounds each frame (see ShadowCatcherModule.tsx).
 */
import {
  BLEND_PREMULTIPLIED,
  SHADOW_VSM_16F,
  SHADOWUPDATE_REALTIME as SHADOWUPDATE,
  type AppBase,
  BoundingBox,
  type CameraComponent,
  Entity,
  Layer,
  type MeshInstance,
  type RenderComponent,
  StandardMaterial,
} from 'playcanvas'

const litUserMainEndGLSL = `
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - gl_FragColor.r);
`
const litUserMainEndWGSL = `
    output.color = vec4f(0.0, 0.0, 0.0, 1.0 - output.color.r);
`

export class ShadowCatcher {
  layer: Layer
  material: StandardMaterial
  plane: Entity
  light: Entity
  sceneRoot: Entity
  camera: CameraComponent

  constructor(app: AppBase, camera: CameraComponent, parent: Entity, sceneRoot: Entity) {
    this.layer = new Layer({ name: 'Shadow Layer' })
    const layers = app.scene.layers
    const worldLayer = layers.getLayerByName('World')
    const idx = layers.getTransparentIndex(worldLayer!)
    layers.insert(this.layer, idx + 1)

    this.material = new StandardMaterial()
    this.material.blendType = BLEND_PREMULTIPLIED
    ;(this.material as any).shadowCatcher = true
    this.material.useSkybox = false
    this.material.depthWrite = false
    this.material.diffuse.set(0, 0, 0)
    this.material.specular.set(0, 0, 0)
    ;(this.material as any).shaderChunks?.glsl?.set('litUserMainEndPS', litUserMainEndGLSL)
    ;(this.material as any).shaderChunks?.wgsl?.set('litUserMainEndPS', litUserMainEndWGSL)
    this.material.update()

    this.plane = new Entity('ShadowPlane')
    this.plane.addComponent('render', { type: 'plane', castShadows: false, material: this.material })

    this.light = new Entity('ShadowLight')
    this.light.addComponent('light', {
      type: 'directional', castShadows: true, normalOffsetBias: 0, shadowBias: 0.0,
      shadowResolution: 1024, shadowType: SHADOW_VSM_16F, shadowUpdateMode: SHADOWUPDATE,
      vsmBlurSize: 64, enabled: true, shadowIntensity: 0.4,
    })

    parent.addChild(this.plane)
    parent.addChild(this.light)
    this.plane.render!.layers = [this.layer.id]
    this.light.light!.layers = [this.layer.id]
    camera.layers = camera.layers.concat([this.layer.id])

    this.sceneRoot = sceneRoot
    this.camera = camera
  }

  // engine path: streamed scenes — recompute the full caster set on a throttled tick.
  setCasters(entities: Entity[]) {
    const casters: MeshInstance[] = []
    for (const e of entities) {
      e.findComponents('render').forEach((c) => { casters.push(...(c as RenderComponent).meshInstances) })
    }
    this.layer.shadowCasters = casters
  }

  // model-viewer path: incremental per-entity add/remove (kept so BOTH apps share this one file).
  onEntityAdded(entity: Entity) {
    entity.findComponents('render').forEach((c) => {
      this.layer.shadowCasters = this.layer.shadowCasters.concat((c as RenderComponent).meshInstances)
    })
  }

  onEntityRemoved(entity: Entity) {
    entity.findComponents('render').forEach((c) => {
      const mis = (c as RenderComponent).meshInstances
      this.layer.shadowCasters = this.layer.shadowCasters.filter((mi) => mis.indexOf(mi) === -1)
    })
  }

  onUpdate(sceneBounds: BoundingBox) {
    const center = sceneBounds.center
    const he = sceneBounds.halfExtents
    const len = Math.sqrt(he.x * he.x + he.z * he.z)
    this.plane.setLocalScale(len * 4, 1, len * 4)
    this.plane.setPosition(center.x, sceneBounds.getMin().y, center.z)
    this.light.light!.shadowDistance = this.camera.farClip
  }

  destroy() {
    try { this.plane.destroy(); this.light.destroy() } catch { /* already */ }
  }

  set enabled(enabled: boolean) { this.layer.enabled = enabled; this.light.enabled = enabled }
  get enabled() { return this.layer.enabled }
  set intensity(value: number) { this.light.light!.shadowIntensity = value }
  get intensity() { return this.light.light!.shadowIntensity }
}
