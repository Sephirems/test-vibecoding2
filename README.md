# Auto Reframe

Turns a horizontal (16:9) video into a vertical (9:16) one, automatically keeping
the main subject in frame. Everything runs in the browser — no upload, no server.

## Requirements

- Node 20+
- A recent Chrome or Edge (the export relies on the WebCodecs API)

## Getting started

```
npm install
npm run dev
```

`npm install` also downloads the detection model and copies the MediaPipe WASM
runtime into `public/` (see `scripts/fetch-assets.mjs`). Neither is committed.

## How it works

1. **Detect** — a frame is sampled a few times per second and run through
   MediaPipe's object detector, restricted to people.
2. **Select** — among the people found, one is picked by weighting its size,
   its position, the detector confidence, and how close it is to the subject of
   the previous sample (which is what keeps the framing on the same person).
3. **Track** — the per-sample positions form a single track. A subject that
   disappears briefly holds its last position; a subject gone for longer makes
   the framing drift back to the center.
4. **Smooth** — a deadzone (the crop does not move at all while the subject
   stays near the middle), a zero-phase low-pass filter, then a hard speed
   limit. This is what removes shaking and whip pans.
5. **Crop** — a full-height, 9:16-wide window, always clamped inside the source.
6. **Export** — each output frame is drawn into a 1080×1920 canvas and encoded
   with WebCodecs; the audio track is decoded, re-encoded to AAC and muxed into
   the same MP4.

## Tuning

Every threshold, weight and output setting lives in [`src/config.ts`](src/config.ts).
The values worth playing with first are `analysis.samplesPerSecond` (accuracy vs
speed), `smoothing.deadzone` and `smoothing.emaAlpha`.

## Structure

```
src/
  config.ts            all tunable values
  types.ts
  core/                no React in here, pure pipeline
    video/             loading, validation, frame access
    detection/         MediaPipe wrapper
    tracking/          subject selection, track building
    crop/              smoothing, crop geometry
    export/            WebCodecs video + AAC audio, MP4 muxing
    analyze.ts         orchestration
  ui/                  React components and styles
```

## Known limitations

- Chrome/Edge only, because of WebCodecs.
- No scene-cut detection: a hard cut makes the framing pan slowly across the
  new shot instead of jumping.
- Export runs roughly at 1–3× the video duration.
- The subject is centered horizontally; there is no look-ahead room based on
  gaze direction yet.
