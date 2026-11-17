# Adaptive Bitrate Streaming — Test Results

## Test Environment

- Application: React + HLS.js
- Video duration: 90 seconds
- Available resolutions: 240p, 360p, 480p, 720p, 1080p
- Testing method: Browser DevTools network throttling

## Test 1: Upward Quality Switching

**Scenario:** Start playback with low quality and allow the network bandwidth to increase.

**Observed result:**
- Playback started at 360p.
- The algorithm selected 720p and subsequently 1080p.
- Actual downloaded segments changed to 1080p.
- No buffering or pause events were observed in the recorded test.

**Status:** Verified.

## Test 2: Downward Quality Switching

**Scenario:** Reduce available network bandwidth during playback.

**Observed result:**
- The algorithm detected a bandwidth drop.
- Quality was reduced from 1080p to 360p.
- The actual downloaded quality was verified at 360p.

**Status:** Verified.

## Test 3: Slow 4G

**Scenario:** Play the 90-second video under Slow 4G throttling.

**Observed result:**
- Playback completed.
- No buffering events were observed in the recorded test.
- Actual downloaded quality was 360p in the recorded run.

**Status:** Passed in the recorded test.

## Test 4: Slow 3G Before 240p

**Scenario:** Play the video under very slow network conditions.

**Observed result:**
- Average measured bandwidth was approximately 0.07 Mbps.
- The player selected 360p.
- Fourteen buffering events were observed.

**Status:** Buffering observed.

## Test 5: Slow 3G After Adding 240p

**Scenario:** Add a lower 240p rendition and repeat the test.

**Observed result:**
- Selected quality: 240p.
- Actual downloaded quality: 240p.
- Average measured bandwidth: approximately 0.06 Mbps.
- Buffering events: 0.
- Pause events: 0.
- Video playback completed.

**Status:** Passed in the recorded test.

## Summary

| Feature | Result |
|---|---|
| HLS playback | Verified |
| Multiple resolutions | Verified |
| Bandwidth estimation | Verified |
| Buffer monitoring | Verified |
| Upward quality switching | Verified |
| Downward quality switching | Verified |
| Slow 4G playback | Passed in recorded test |
| Slow 3G with 240p | Passed in recorded test |

## Conclusion

The POC demonstrates custom adaptive bitrate selection using bandwidth estimation and playback buffer monitoring.

The addition of a 240p rendition improved playback under the tested Slow 3G conditions.

Results are specific to the recorded browser throttling tests and should not be treated as guarantees for all network conditions.
