# Adaptive Bitrate Streaming project task:

---

## **What is the Task?**

Build a **Smart Video Player** that automatically changes the video quality based on your internet speed and buffer so the video plays without stopping or buffering.

### **1. Multiple Quality Levels**

Create 4 versions of your original video:

* **360p**, **480p**, **720p**, and **1080p**

Cut each version into small pieces called **segments** (each 2 to 4 seconds long).

* *Example:* A 1-minute video has 15 segments. Across 4 qualities, that makes 60 total files.

### **2. Bandwidth Estimation**

The player needs to measure internet speed by checking how long it takes to download a video segment.

* *Example:* Downloading a 4 MB segment in 2 seconds means fast internet, but taking 8 seconds means slow internet. The player tracks the average speed of recent downloads.

### **3. Buffer-Aware Decision**

The **Buffer** is the part of the video that is already downloaded and ready to play.

* **20 seconds of buffer:** Safe to choose a higher quality.
* **5 seconds of buffer:** Choose a safe/medium quality.
* **1–2 seconds of buffer:** Drop down to a lower quality immediately.

### **4. Seamless Switching**

When the internet slows down, the video quality must drop smoothly without stopping the video.

* *Example:* Segments 1 and 2 play in 720p. When the internet slows, segments 3 and 4 switch to 480p.
* **Rules:** The video must not restart, go back to the beginning, or pause. The quality changes naturally when the current segment finishes.

---

## **What You Need to Submit**

1. Working Proof of Concept (POC).
2. Clean source code.
3. README file explaining the project.
4. Architecture note on how it works.
5. A short demo recording.

---