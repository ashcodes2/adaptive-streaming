import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import "./App.css";

function App() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const bandwidthRef = useRef(0);
  const selectedLevelRef = useRef(-1);
  const switchCountRef = useRef(0);
  const bufferingCountRef = useRef(0);

  const [currentQuality, setCurrentQuality] = useState("Detecting...");
  const [activeQuality, setActiveQuality] = useState("Waiting...");
  const [nextQuality, setNextQuality] = useState("Detecting...");

  const [dashboard, setDashboard] = useState({
    bandwidth: 0,
    buffer: 0,
    playback: 0,
    status: "Initializing",
    segment: "-",
    switchCount: 0,
    bufferingCount: 0
  });

  useEffect(() => {
    const video = videoRef.current;
    let isMounted = true;

    if (!video || !Hls.isSupported()) {
      console.error("HLS.js is not supported in this browser.");
      return;
    }

    const hls = new Hls({
      startLevel: -1,
      capLevelToPlayerSize: false,
      maxBufferLength: 10,
      maxMaxBufferLength: 15,
      backBufferLength: 10
    });

    hlsRef.current = hls;

    // Helper to prevent unnecessary re-renders/flicker
    const updateDashboard = (patch) => {
      if (!isMounted) return;
      setDashboard(previous => {
        const changed = Object.entries(patch).some(([key, value]) => {
          if (typeof value === "number") {
            return Math.abs((previous[key] ?? 0) - value) >= 0.1;
          }
          return previous[key] !== value;
        });
        return changed ? { ...previous, ...patch } : previous;
      });
    };

    // ---------------------------------------
    // 1. BUFFER CALCULATION
    // ---------------------------------------
    const getBufferAhead = () => {
      const currentTime = video.currentTime;
      let furthestEnd = currentTime;

      for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);

        if (start <= currentTime + 0.25 && end > currentTime) {
          furthestEnd = Math.max(furthestEnd, end);
        }
      }

      return Math.max(0, furthestEnd - currentTime);
    };

    // ---------------------------------------
    // 2. CUSTOM ABR QUALITY SELECTION
    // ---------------------------------------
    const selectQuality = () => {
      const levels = hls.levels;
      const bandwidth = bandwidthRef.current;

      if (!levels.length || bandwidth <= 0) {
        return;
      }

      const buffer = getBufferAhead();
      const safeBandwidth = bandwidth * 0.8 * 1_000_000;

      let maxHeight;
      if (bandwidth > 4) {
        maxHeight = buffer >= 5 ? 1080 : 720;
      } else if (bandwidth >= 1.5) {
        maxHeight = 720;
      } else if (bandwidth >= 0.8) {
        maxHeight = 480;
      } else if (bandwidth >= 0.35) {
        maxHeight = 360;
      } else {
        maxHeight = 240;
      }

      // Safeguard buffer priority
      if (buffer < 3) {
        maxHeight = Math.min(maxHeight, 360);
      } else if (buffer < 5) {
        maxHeight = Math.min(maxHeight, 720);
      }

      const sortedLevels = levels
        .map((level, index) => ({
          index,
          height: level.height,
          bitrate:
            level.bitrate ||
            level.averageBitrate ||
            level.maxBitrate ||
            0
        }))
        .filter(level => level.bitrate > 0)
        .sort((a, b) => a.bitrate - b.bitrate);

      if (!sortedLevels.length) return;

      const candidates = sortedLevels.filter(
        level => level.height <= maxHeight && level.bitrate <= safeBandwidth
      );

      const selected = candidates.length
        ? candidates[candidates.length - 1]
        : sortedLevels[0];

      const previousIndex = selectedLevelRef.current;
      selectedLevelRef.current = selected.index;

      // Guide HLS.js automatic ABR without locking manual quality
      hls.nextAutoLevel = selected.index;

      setNextQuality(`${selected.height}p`);

      if (previousIndex !== selected.index) {
        switchCountRef.current++;
        updateDashboard({ switchCount: switchCountRef.current });
      }

      updateDashboard({
        bandwidth,
        buffer,
        status: "Adaptive quality updated"
      });

      console.log("ABR DECISION", {
        bandwidth,
        safeBandwidth: safeBandwidth / 1_000_000,
        buffer,
        target: maxHeight,
        nextQuality: selected.height,
        levelIndex: selected.index
      });
    };

    // ---------------------------------------
    // 3. MANIFEST PARSED
    // ---------------------------------------
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const levels = hls.levels;
      console.log("HLS manifest loaded");

      console.table(
        levels.map((level, index) => ({
          index,
          height: level.height,
          bitrate: level.bitrate
        }))
      );

      const hdIndex = levels.findIndex(level => level.height === 720);
      const startIndex = hdIndex !== -1 ? hdIndex : 0;

      selectedLevelRef.current = startIndex;
      hls.startLevel = startIndex;
      hls.nextAutoLevel = startIndex;

      const initialQuality = `${levels[startIndex].height}p`;
      setNextQuality(initialQuality);
      updateDashboard({ status: `Starting at ${initialQuality}` });
    });

    // ---------------------------------------
    // 4. EVENT HANDLERS
    // ---------------------------------------
    const handleLevelSwitched = (event, data) => {
      const level = hls.levels[data.level];
      if (!level) return;
      const quality = `${level.height}p`;
      setActiveQuality(quality);
      console.log("ACTIVE QUALITY:", quality);
    };

    const handleFragLoaded = (event, data) => {
      if (data.frag.type !== "main") return;

      const stats = data.frag.stats;
      const loading = stats?.loading;
      if (!loading) return;

      const bytes = Number(stats.loaded);
      const start = Number(loading.start);
      const end = Number(loading.end);
      const firstByte = Number(loading.first);
      const downloadStart = firstByte > 0 ? firstByte : start;
      const duration = (end - downloadStart) / 1000;

      if (
        !Number.isFinite(bytes) ||
        !Number.isFinite(duration) ||
        bytes < 10 * 1024 ||
        duration <= 0
      ) {
        console.warn("Invalid bandwidth sample", { bytes, duration });
        return;
      }

      const measured = (bytes * 8) / (duration * 1_000_000);
      if (!Number.isFinite(measured) || measured <= 0) return;

      if (bandwidthRef.current === 0) {
        bandwidthRef.current = measured;
      } else {
        const alpha = measured < bandwidthRef.current ? 0.65 : 0.25;
        bandwidthRef.current =
          alpha * measured + (1 - alpha) * bandwidthRef.current;
      }

      const height = hls.levels[data.frag.level]?.height;
      if (height) {
        setCurrentQuality(`${height}p`);
      }

      updateDashboard({
        bandwidth: bandwidthRef.current,
        segment: data.frag.sn
      });

      console.log("SEGMENT DOWNLOADED", {
        segment: data.frag.sn,
        bytes,
        duration,
        measuredMbps: measured,
        averageMbps: bandwidthRef.current,
        quality: height
      });
    };

    const handleBufferAppended = () => {
      const buffer = getBufferAhead();
      updateDashboard({ buffer });
    };

    const handleFragBuffered = (event, data) => {
      if (data.frag.type !== "main") return;
      selectQuality();
    };

    const handleVideoProgress = () => {
      updateDashboard({
        buffer: getBufferAhead(),
        playback: video.currentTime
      });
    };

    const handlePlaying = () => {
      updateDashboard({ status: "Playing" });
    };

    const handleWaiting = () => {
      bufferingCountRef.current++;
      updateDashboard({
        bufferingCount: bufferingCountRef.current,
        status: "Buffering"
      });
    };

    const handlePause = () => {
      if (!video.ended && !video.seeking) {
        updateDashboard({ status: "Paused" });
      }
    };

    const handleError = (event, data) => {
      console.error("HLS Error:", data);
      if (data.fatal) {
        updateDashboard({ status: `Playback error: ${data.type}` });
      }
    };

    // Register HLS Events
    hls.on(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched);
    hls.on(Hls.Events.FRAG_LOADED, handleFragLoaded);
    hls.on(Hls.Events.BUFFER_APPENDED, handleBufferAppended);
    hls.on(Hls.Events.FRAG_BUFFERED, handleFragBuffered);
    hls.on(Hls.Events.ERROR, handleError);

    // Register Video Events
    video.addEventListener("timeupdate", handleVideoProgress);
    video.addEventListener("progress", handleVideoProgress);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("pause", handlePause);

    // ---------------------------------------
    // 5. START PLAYER
    // ---------------------------------------
    hls.loadSource("/videos/hls/master.m3u8");
    hls.attachMedia(video);

    // ---------------------------------------
    // 6. CLEANUP PHASE
    // ---------------------------------------
    return () => {
      isMounted = false;
      video.removeEventListener("timeupdate", handleVideoProgress);
      video.removeEventListener("progress", handleVideoProgress);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("pause", handlePause);

      hls.off(Hls.Events.LEVEL_SWITCHED, handleLevelSwitched);
      hls.off(Hls.Events.FRAG_LOADED, handleFragLoaded);
      hls.off(Hls.Events.BUFFER_APPENDED, handleBufferAppended);
      hls.off(Hls.Events.FRAG_BUFFERED, handleFragBuffered);
      hls.off(Hls.Events.ERROR, handleError);

      hls.destroy();
      hlsRef.current = null;
    };
  }, []);

  const formatBandwidth = value => {
    if (!value) return "Measuring...";
    if (value < 0.01) return "< 0.01 Mbps";
    return `${value.toFixed(2)} Mbps`;
  };

  const formatTime = value => {
    const seconds = Math.floor(value || 0);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return (
    <div className="streamflow">
      <header className="streamflow-header">
        <div>
          <h1>StreamFlow</h1>
          <p>Smart Adaptive Video Streaming</p>
        </div>
        <span className="live-status">● Streaming System</span>
      </header>

      <section className="player-card">
        <h2>Now Playing</h2>
        <video
          ref={videoRef}
          controls
          playsInline
          className="video-player"
        />
        <p className="player-caption">
          Video quality automatically adjusts according to your internet speed.
        </p>
      </section>

      <section className="quality-card">
        <h2>Video Quality</h2>
        <div className="quality-value">{activeQuality}</div>
        <p>Currently active resolution</p>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Current Quality</span>
          <strong>{currentQuality}</strong>
          <small>Last downloaded segment</small>
        </article>

        <article className="metric-card">
          <span>Next Segment Quality</span>
          <strong>{nextQuality}</strong>
          <small>ABR recommendation</small>
        </article>

        <article className="metric-card">
          <span>Internet Speed</span>
          <strong>{formatBandwidth(dashboard.bandwidth)}</strong>
          <small>Estimated download throughput</small>
        </article>

        <article className="metric-card">
          <span>Available Buffer</span>
          <strong>{dashboard.buffer.toFixed(2)} sec</strong>
          <small>Playback buffer runway</small>
        </article>

        <article className="metric-card">
          <span>Playback Position</span>
          <strong>{formatTime(dashboard.playback)}</strong>
          <small>Current video position</small>
        </article>

        <article className="metric-card">
          <span>Quality Switches</span>
          <strong>{dashboard.switchCount}</strong>
          <small>ABR level decisions</small>
        </article>
      </section>

      <section className="status-card">
        <h2>Streaming Overview</h2>
        <p><strong>Player Status:</strong> {dashboard.status}</p>
        <p><strong>Last Segment:</strong> {dashboard.segment}</p>
        <p><strong>Buffering Events:</strong> {dashboard.bufferingCount}</p>
      </section>
    </div>
  );
}

export default App;