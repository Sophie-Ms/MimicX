
import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

export function createBloomPipeline(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");

  const bloomPass = bloom(sceneColor);

  // Bloom appearance
  bloomPass.threshold.value = 0.15;
  bloomPass.strength.value = 1.4;
  bloomPass.radius.value = 0.65;

  // Combine original scene with bloom
  pipeline.outputNode = sceneColor.add(bloomPass);

  return pipeline;
}
