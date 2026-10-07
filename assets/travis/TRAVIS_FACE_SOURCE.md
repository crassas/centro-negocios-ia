# Travis realistic face source

Source: Blender Studio / Blender Community — Human Base Meshes v1.4.1.
Asset used: Head (Animation) - Realistic.
Source bundle: https://download.blender.org/demo/asset-bundles/human-base-meshes/
License: CC0 / Public Domain for the Human Base Meshes asset bundle.
Runtime derivative: travis-face-realistic.glb.

Anatomical bust derivative: travis-face-bust.glb.
Continues the existing Blender-exported Human Base Meshes body bust (head, neck and shoulders in one mesh).
Refinement: one subdivision level, flat crop below the clavicles, separate curved iris and pupil surfaces.
Orientation: glTF +Y up, face towards +Z. Runtime validates dimensions and centres the asset.
Reproduction: scripts/prepare_travis_bust.py takes the preserved source GLB and exports the runtime derivative.
