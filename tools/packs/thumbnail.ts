import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { chromium, type Browser, type Page } from "@playwright/test"

/**
 * Catalog thumbnails (PLAN 14.7): each model's GLB, exactly as the pack stores it, drawn by
 * three.js (the app's own copy) in headless Chromium from the 3D view's home direction, on a
 * transparent background. The page loads nothing from the network: every request is served
 * from node_modules or the GLB in hand.
 */
const SIZE = 256
const THREE = fileURLToPath(new URL("../../node_modules/three/", import.meta.url))
const ORIGIN = "http://thumbnails.invalid"

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from "three"
import { GLTFLoader } from "/three/examples/jsm/loaders/GLTFLoader.js"
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.toneMapping = THREE.NeutralToneMapping
renderer.setClearColor(0x000000, 0)
window.render = async (url) => {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const gltf = await new GLTFLoader().loadAsync(url)
  scene.add(gltf.scene)
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const camera = new THREE.PerspectiveCamera(30, 1, sphere.radius / 100, sphere.radius * 100)
  const dir = new THREE.Vector3(1, 0.9, 1.2).normalize()
  const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05
  camera.position.copy(sphere.center).addScaledVector(dir, distance)
  camera.lookAt(sphere.center)
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL("image/png")
}
window.ready = true
</script></body></html>`

export class Thumbnailer {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
    private glb: Uint8Array = new Uint8Array(),
    private renders = 0
  ) {}

  static async start(): Promise<Thumbnailer> {
    const executablePath = process.env.E2E_CHROMIUM_PATH
    const browser = await chromium.launch({
      ...(executablePath && { executablePath }),
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    })
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
    const t = new Thumbnailer(browser, page)
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== ORIGIN) return route.abort()
      if (url.pathname === "/") return route.fulfill({ body: PAGE, contentType: "text/html" })
      if (url.pathname === "/model.glb")
        return route.fulfill({ body: Buffer.from(t.glb), contentType: "model/gltf-binary" })
      const file = url.pathname.match(/^\/three\/((?:build|examples\/jsm)\/[\w/.-]+\.js)$/)?.[1]
      if (!file || file.includes("..")) return route.abort()
      return route.fulfill({ body: readFileSync(THREE + file), contentType: "text/javascript" })
    })
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true)
    return t
  }

  /** A 256 px PNG of `glb`. */
  async render(glb: Uint8Array): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }> {
    this.glb = glb
    const dataUrl = await this.page.evaluate(
      (u) => (window as unknown as { render(u: string): Promise<string> }).render(u),
      `${ORIGIN}/model.glb?n=${++this.renders}`
    )
    const png = new Uint8Array(
      Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
    )
    return { png, widthPx: SIZE, heightPx: SIZE }
  }

  close(): Promise<void> {
    return this.browser.close()
  }
}
