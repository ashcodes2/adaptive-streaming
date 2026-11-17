# Adaptive Bitrate Streaming — Architecture

## 1. System Overview

The application uses a React frontend, HLS.js playback engine, FFmpeg video processing and a custom ABR algorithm.

## 2. Architecture Flow

```text
Original Video
      |
      v
    FFmpeg
      |
      v
Multiple Resolutions
240p | 360p | 480p | 720p | 1080p
      |
      v
   HLS Packaging
      |
      v
Master Playlist
      |
      v
React Video Player
      |
      v
     HLS.js
      |
      v
Custom ABR Algorithm
      |
      +-------------------+
      |                   |
      v                   v
Bandwidth Estimation   Buffer Monitoring
      |                   |
      +---------+---------+
                |
                v
        Quality Selection
                |
                v
       Future Segment Loading
                |
                v
         Video Playback
```

## 3. Main Components

### A. FFmpeg

FFmpeg is used to:
- Generate different video resolutions.
- Encode video variants.
- Divide videos into HLS segments.
- Generate `.m3u8` playlists and `.ts` segments.

### B. HLS

HLS stands for HTTP Live Streaming.

Each quality has its own playlist and video segments.

The master playlist contains references to all available resolutions.

### C. React Player

React provides the video player and dashboard.

HLS.js loads and manages HLS playback in browsers that do not support HLS natively.

### D. Bandwidth Estimation

The application estimates fragment download throughput using:

```js
const currentBandwidth =
  (bytes * 8) / (downloadTime * 1000000);
```

An asymmetric Exponential Moving Average is used to smooth measurements and react faster to bandwidth drops.

```js
const alpha =
  currentBandwidth < previousBandwidth ? 0.7 : 0.2;

averageBandwidth =
  alpha * currentBandwidth +
  (1 - alpha) * previousBandwidth;
```

### E. Buffer Monitoring

The player calculates how many seconds of video are available ahead of the current playback position.

The algorithm uses buffer availability to restrict quality upgrades and reduce buffering risk.

### F. Custom ABR Algorithm

The algorithm considers:

- Estimated average bandwidth.
- A bandwidth safety margin.
- Available playback buffer.
- Available quality levels.
- Upgrade stability.

It selects a quality level and assigns it to HLS.js for future fragment loading using `hls.loadLevel`.

It avoids immediate buffer-flushing switches.

## 4. Dashboard Metrics

The dashboard displays:

- Average bandwidth
- Available buffer
- Current playback time
- Selected quality
- Actual downloaded quality
- Last downloaded segment
- Quality switch count
- Buffering event count
- Pause event count

## 5. Important Design Consideration

The selected quality and actual downloaded quality are different concepts.

A quality decision applies to future fragment loading. A segment already requested or downloaded may still use the previous quality.

Also, if available network throughput is lower than the bitrate of the lowest rendition, buffering can still occur.
