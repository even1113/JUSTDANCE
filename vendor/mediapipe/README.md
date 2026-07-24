# MediaPipe browser assets

`pose_landmarker_lite.task` is the official MediaPipe Pose Landmarker Lite model.
It is kept in the repository so the application does not fetch a model from
Google at runtime. The generated `vision_bundle.mjs` and `wasm/` files are
copied from the pinned `@mediapipe/tasks-vision` dependency by `npm run prepare`
and are intentionally ignored by Git.

- Runtime package: Apache-2.0, `@mediapipe/tasks-vision@0.10.35`
- Model source: <https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task>
