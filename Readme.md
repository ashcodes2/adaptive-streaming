# 🎬 Adaptive Bitrate (ABR) Video Streaming & StreamFlow Dashboard

[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![HLS.js](https://img.shields.io/badge/HLS.js-Core_Engine-FF6B6B?style=for-the-badge&logo=javascript&logoColor=white)](https://github.com/video-dev/hls.js/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Transcoder-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![Vite](https://img.shields.io/badge/Vite-Bundler-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License-MIT](https://img.shields.io/badge/License-MIT-yellowgreen?style=for-the-badge)](LICENSE)

> A production-grade **Adaptive Bitrate (ABR) Streaming Platform** built with **React**, **HLS.js**, and **FFmpeg**. Features a **custom dual-factor ABR algorithm** (Bandwidth Estimation via Asymmetric EMA + Buffer Runway Guardrails) that dynamically adjusts playback resolution across 5 quality tiers (240p to 1080p) to guarantee **zero-stall, stall-free video playback**, complete with a real-time **StreamFlow telemetry dashboard**.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [High-Level Architecture](#-high-level-architecture)
- [Custom ABR Algorithm Deep Dive](#-custom-abr-algorithm-deep-dive)
  - [1. Bandwidth Estimation (Asymmetric EMA)](#1-bandwidth-estimation-asymmetric-ema)
  - [2. Buffer Runway Safety Guardrails](#2-buffer-runway-safety-guardrails)
  - [3. Seamless Next-Segment Switching](#3-seamless-next-segment-switching)
- [StreamFlow Dashboard (9 Live Metrics)](#-streamflow-dashboard-9-live-metrics)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started & Installation](#-getting-started--installation)
  - [Prerequisites](#prerequisites)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Generate HLS Streams (FFmpeg)](#2-generate-hls-streams-ffmpeg-optional)
  - [3. Run the Client Application](#3-run-the-client-application)
- [Testing & Verification](#-testing--verification)
- [Tech Stack](#-tech-stack)
- [Author & Acknowledgments](#-author--acknowledgments)

---

## 🌟 Overview

In traditional video streaming, network bandwidth drops cause playback to freeze, leading to disruptive buffering spinners. **Adaptive Bitrate (ABR) Streaming** solves this problem by segmenting video into short chunk files (2–4 seconds) across multiple resolutions. 

This project implements a **custom, client-side ABR controller** that continuously evaluates:
1. **Real-time network throughput** (using packet arrival duration and downloaded bytes).
2. **Buffer runway health** (seconds of playable media cached ahead of the playhead).

When network speeds degrade, the player smoothly downscales resolution on upcoming segments—preventing player stalls before they happen. When bandwidth recovers and the buffer stabilizes, playback automatically scales back up to Full HD.

---

## ⚡ Key Features

- **Multi-Bitrate HLS Profiles:** 5 adaptive quality tiers: `240p`, `360p`, `480p`, `720p`, and `1080p`.
- **4-Second Segment Slicing:** Micro-segmented video chunks for rapid adaptation and fast start times.
- **Asymmetric Exponential Moving Average (EMA):** Prevents quality oscillations with fast-reacting drop protection ($\alpha = 0.65$) and conservative upgrade filtering ($\alpha = 0.25$).
- **Buffer Runway Priority:** Critical buffer thresholds prevent player starvation under extreme network drops.
- **Seamless Next-Segment Switching:** Resolution adjustments apply exclusively to the next requested chunk; current buffered content plays without stutter, pause, or reset.
- **StreamFlow Live Telemetry Dashboard:** 9 real-time metrics cards monitoring bandwidth, buffer health, active quality, switches, and buffering events.
- **Browser-Side Decision Engine:** Fully decoupled from backend processing—static web servers serve lightweight files while client JavaScript drives all intelligence.

---

## 🏗️ High-Level Architecture

```text
+-------------------------------------------------------------------------------+
|                        1. Offline Video Preparation                           |
|  [Raw Master Video: input2.mp4]                                               |
|         |                                                                     |
|         v (FFmpeg Multi-Bitrate Transcoding)                                  |
|  [240p, 360p, 480p, 720p, 1080p Profiles]                                     |
|         |                                                                     |
|         v (HLS Segmentation)                                                  |
|  [master.m3u8] + [Variant Playlists index.m3u8] + [4-sec .ts Chunks]          |
+-------------------------------------------------------------------------------+
                                      |
                                      v (Static File Delivery)
+-------------------------------------------------------------------------------+
|                        2. Static Web Server / CDN                             |
|  Serves .m3u8 manifests and .ts segment chunks over HTTP upon request         |
+-------------------------------------------------------------------------------+
                                      |
                                      v (HTTP Requests)
+-------------------------------------------------------------------------------+
|                   3. Client Application (React + HLS.js)                      |
|                                                                               |
|   +---------------------+        FRAG_LOADED Stats      +-----------------+   |
|   |   HLS.js Engine     |------------------------------>| Bandwidth EMA   |   |
|   | (Chunk Downloader & |                               | Estimator (Mbps)|   |
|   |  Media Demuxer)     |<------------------------------+-----------------+   |
|   +---------------------+       nextAutoLevel                   |             |
|              |                  Decision                        v             |
|     Feeds    |                                          +-----------------+   |
|     Media    v                                          | Custom ABR      |   |
|   +---------------------+      currentTime & buffered   | Decision Brain  |   |
|   | HTML5 <video> Player|------------------------------>| (Safe Headroom &|   |
|   +---------------------+                               | Buffer Guard)   |   |
|              |                                          +-----------------+   |
|              +--------------------------------------------------+             |
|                                 |                                             |
|                                 v (Live Telemetry State)                      |
|   +-----------------------------------------------------------------------+   |
|   |                  4. StreamFlow Live Dashboard UI                      |   |
|   |  [Bandwidth] [Buffer Runway] [Active Quality] [Next Quality] [Stalls] |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

---

## 🧠 Custom ABR Algorithm Deep Dive

The algorithm runs continuously inside [App.jsx](client/src/App.jsx) and governs every upcoming chunk download.

### 1. Bandwidth Estimation (Asymmetric EMA)
Whenever a chunk finishes downloading, the instantaneous throughput is calculated:

$$\text{Throughput (Mbps)} = \frac{\text{Downloaded Bytes} \times 8}{\text{Duration (seconds)} \times 1,000,000}$$

To prevent quality flickering caused by short-lived network spikes or dips, an **Asymmetric Exponential Moving Average (EMA)** is applied:

$$\text{Bandwidth}_{\text{EMA}} = \alpha \times \text{Measured} + (1 - \alpha) \times \text{Bandwidth}_{\text{Previous}}$$

* **Drop Condition ($\text{Measured} < \text{Current}$):** $\alpha = 0.65$ (Rapid, sensitive downgrade to protect against imminent player starvation).
* **Rise Condition ($\text{Measured} \ge \text{Current}$):** $\alpha = 0.25$ (Cautious, smoothed upgrade to verify sustained bandwidth stability).

A **20% safety margin** is retained: $\text{Safe Bandwidth} = \text{Bandwidth}_{\text{EMA}} \times 0.8$.

### 2. Buffer Runway Safety Guardrails
The player inspects available playback runway ahead of the current timestamp using `getBufferAhead()`:

$$\text{Buffer Ahead} = \max(0, \text{Furthest Buffered End} - \text{Current Time})$$

| Buffer Available | Maximum Permitted Resolution | Decision Policy |
| :--- | :---: | :--- |
| **Buffer $< 3$ seconds** | **$\le 360\text{p}$** | **Critical Emergency:** Immediately downscale to prevent buffer exhaustion. |
| **Buffer $< 5$ seconds** | **$\le 720\text{p}$** | **Cautionary Buffer:** Cap resolution to prevent buffer depletion. |
| **Buffer $\ge 5$ seconds & Bandwidth $> 4$ Mbps** | **$1080\text{p}$** | **Optimal Conditions:** Safe to play at full High Definition. |

### 3. Seamless Next-Segment Switching
- The chosen index is assigned to `hls.nextAutoLevel`.
- Segments already stored in the media buffer continue rendering without interruption.
- The next incoming `.ts` chunk arrives in the newly selected resolution without any visual flash, rewind, or restart.

---

## 📊 StreamFlow Dashboard (9 Live Metrics)

The built-in monitoring dashboard visualizes client performance in real time:

| # | Metric Name | Indicator | Technical Significance |
| :-: | :--- | :--- | :--- |
| **1** | **Active Quality** | `Active Quality` | Resolution currently rendered by the video player (e.g., `1080p`). |
| **2** | **Last Downloaded Segment** | `Current Quality` | Resolution of the most recently fetched `.ts` segment. |
| **3** | **Next Segment Recommendation** | `ABR Recommendation` | Quality recommended by the custom ABR algorithm for the next chunk. |
| **4** | **Estimated Bandwidth** | `Internet Speed` | Smoothed real-time network throughput displayed in `Mbps`. |
| **5** | **Available Buffer** | `Playback Runway` | Playable runway ahead of current playhead in seconds. |
| **6** | **Playback Position** | `Timeline Position` | Current playhead position in `MM:SS` format. |
| **7** | **Quality Switches** | `Switch Count` | Total resolution up/down adjustments made during the session. |
| **8** | **Player Status** | `Playback State` | Current player state (`Playing`, `Buffering`, `Paused`, `Initializing`). |
| **9** | **Buffering Events** | `Stall Count` | Cumulative count of playback stalls caused by buffer underruns. |

---

## 📁 Project Directory Structure

```text
adaptive-streaming/
├── client/                           # React Frontend Application
│   ├── public/
│   │   └── videos/
│   │       └── hls/                  # HLS stream files served to browser
│   ├── src/
│   │   ├── App.jsx                   # Player, ABR decision brain & dashboard
│   │   ├── App.css                   # Custom StreamFlow dark theme styles
│   │   ├── main.jsx                  # Application entry point
│   │   └── index.css
│   ├── index.html                    # HTML shell
│   ├── package.json                  # Dependencies (React, Vite, HLS.js)
│   └── vite.config.js
│
├── videos/
│   └── input2.mp4                    # Source high-resolution video
│
├── output/                           # Transcoded HLS assets
│   ├── master.m3u8                   # Master variant playlist
│   ├── 240p.mp4 ... 1080p.mp4        # Individual resolution MP4s
│   └── hls/
│       ├── 240p/ (index.m3u8 + .ts)
│       ├── 360p/ (index.m3u8 + .ts)
│       ├── 480p/ (index.m3u8 + .ts)
│       ├── 720p/ (index.m3u8 + .ts)
│       └── 1080p/ (index.m3u8 + .ts)
│
├── .gitignore                        # Standard git exclusions
├── Architecture.md                   # System design architecture document
├── Test_Result.md                    # Verification records under network throttling
├── task.md                           # Core project requirements specification
└── README.md                         # Complete project documentation
```

---

## 🚀 Getting Started & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0 or higher)
- [FFmpeg](https://ffmpeg.org/) (optional, only needed if transcoding new videos)

### 1. Clone Repository
```bash
git clone https://github.com/<your-username>/adaptive-streaming.git
cd adaptive-streaming
```

### 2. Generate HLS Streams (FFmpeg, Optional)
If you wish to re-encode `videos/input2.mp4`:
```bash
# Example: Generate 720p stream with 4-second segments
ffmpeg -i videos/input2.mp4 -vf scale=-2:720 -c:v libx264 -b:v 1500k \
  -hls_time 4 -hls_playlist_type vod -hls_segment_filename "output/hls/720p/segment_%03d.ts" \
  output/hls/720p/index.m3u8
```

### 3. Run the Client Application
```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser at the local URL (e.g. `http://localhost:5173`) to view the video stream and live dashboard.

---

## 🧪 Testing & Verification

The adaptive behavior was verified using **Chrome DevTools Network Throttling**:

| Test Scenario | Network Profile | Observed Adaptation | Status |
| :--- | :--- | :--- | :---: |
| **Upward Quality Switching** | Throttling disabled after start | 360p $\rightarrow$ 720p $\rightarrow$ 1080p as bandwidth rose | ✅ Verified |
| **Downward Quality Switching** | Bandwidth throttled to 1 Mbps | 1080p dropped to 360p smoothly; buffer stayed $> 3\text{s}$ | ✅ Verified |
| **Slow 4G Emulation** | Slow 4G profile | Steady playback maintained at 360p/480p with 0 buffering events | ✅ Passed |
| **Bandwidth Fluctuation Test** | Rapid toggling of network profiles | Asymmetric EMA prevented rapid switching; 0 video freezes | ✅ Passed |

> For comprehensive test logs and observed metrics, please inspect [Test_Result.md](Test_Result.md).

---

## 🛠️ Tech Stack

- **Frontend Framework:** [React.js 18](https://reactjs.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Streaming Library:** [HLS.js](https://github.com/video-dev/hls.js/)
- **Media Transcoder:** [FFmpeg](https://ffmpeg.org/)
- **Streaming Protocol:** HTTP Live Streaming (Apple HLS - RFC 8216)
- **Styling:** Custom Modular CSS with Dark UI Theme

---

## 👤 Author

Developed by **Ashwani Upadhyay**  
- **Email:** [avinash744826@gmail.com](mailto:avinash744826@gmail.com)
- **GitHub:** [https://github.com/ashwani-upadhyay](https://github.com)

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
