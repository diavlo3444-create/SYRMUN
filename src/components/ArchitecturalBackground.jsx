import { useEffect, useRef } from 'react';

/**
 * ArchitecturalBackground
 *
 * Keeps the architectural video scrubbed to the page's real scroll position.
 * The mobile video viewport is measured from the live visual viewport so it
 * adapts to portrait/landscape, short screens and the changing mobile browser
 * chrome. Desktop keeps its original full-screen background composition.
 */
export default function ArchitecturalBackground() {
  const videoRef = useRef(null);
  const videoLayerRef = useRef(null);
  const progressBarRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const videoLayer = videoLayerRef.current;
    if (!video || !videoLayer) return undefined;

    let duration = 0;
    let latestTargetTime = 0;
    let frameRequest = 0;
    let unlocked = false;

    video.pause();
    video.loop = false;
    video.muted = true;
    video.playsInline = true;

    const getViewport = () => {
      const visualViewport = window.visualViewport;
      const width = visualViewport?.width || document.documentElement.clientWidth || window.innerWidth;
      const height = visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
      return { width: Math.max(1, width), height: Math.max(1, height) };
    };

    // The mobile backdrop scales with the actual visible screen, not a fixed
    // 45vh/min-height rule. Short landscape phones get a shorter cinematic band.
    const syncViewport = () => {
      const { width, height } = getViewport();
      if (width < 768) {
        const aspect = width / height;
        const heightFactor = aspect > 1.35 ? 0.40 : width < 380 ? 0.30 : 0.32;
        const mobileHeight = Math.min(320, Math.max(164, height * heightFactor));
        videoLayer.style.height = `${Math.round(mobileHeight)}px`;
        video.style.objectPosition = aspect < 0.58 ? '50% 46%' : '50% 50%';
      } else {
        videoLayer.style.height = '';
        video.style.objectPosition = '50% 50%';
      }

      scheduleSeek();
    };

    const getScrollProgress = () => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollTop = Math.max(0, window.scrollY || window.pageYOffset || doc.scrollTop || body.scrollTop || 0);
      const scrollHeight = Math.max(
        doc.scrollHeight,
        body.scrollHeight,
        doc.offsetHeight,
        body.offsetHeight
      );
      const viewportHeight = getViewport().height;
      const maxScroll = Math.max(1, scrollHeight - viewportHeight);
      return Math.min(1, Math.max(0, scrollTop / maxScroll));
    };

    const updateProgressBar = (progress) => {
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${progress})`;
      }
    };

    const applyLatestSeek = () => {
      frameRequest = 0;
      if (!duration || video.readyState < HTMLMediaElement.HAVE_METADATA) return;

      const progress = getScrollProgress();
      latestTargetTime = progress * duration;
      updateProgressBar(progress);

      // Keep only one media seek in flight. When it finishes, seek directly to
      // the newest scroll position instead of dropping scroll updates on mobile.
      if (video.seeking) return;

      if (Math.abs(video.currentTime - latestTargetTime) > 0.035) {
        try {
          video.currentTime = latestTargetTime;
        } catch {
          // Some browsers reject seeks until a media frame is available.
        }
      }
    };

    function scheduleSeek() {
      if (frameRequest) return;
      frameRequest = window.requestAnimationFrame(applyLatestSeek);
    }

    const syncDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        duration = video.duration;
        scheduleSeek();
      }
    };

    const handleSeeked = () => {
      if (!duration) return;
      if (Math.abs(video.currentTime - latestTargetTime) > 0.06) {
        scheduleSeek();
      }
    };

    // iOS Safari can require a user gesture before it will decode a paused
    // video reliably. Prime it once, pause immediately, then continue scrubbing.
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => {
            video.pause();
            scheduleSeek();
          }).catch(() => {
            scheduleSeek();
          });
        }
      } catch {
        scheduleSeek();
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) scheduleSeek();
    };

    video.addEventListener('loadedmetadata', syncDuration);
    video.addEventListener('loadeddata', syncDuration);
    video.addEventListener('durationchange', syncDuration);
    video.addEventListener('canplay', syncDuration);
    video.addEventListener('seeked', handleSeeked);

    window.addEventListener('scroll', scheduleSeek, { passive: true });
    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('orientationchange', syncViewport, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    document.addEventListener('visibilitychange', handleVisibility);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', syncViewport, { passive: true });
    visualViewport?.addEventListener('scroll', scheduleSeek, { passive: true });

    // Recalculate document scroll range when responsive content changes height.
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleSeek)
      : null;
    if (resizeObserver) {
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }

    syncViewport();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) syncDuration();

    return () => {
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      resizeObserver?.disconnect();
      video.removeEventListener('loadedmetadata', syncDuration);
      video.removeEventListener('loadeddata', syncDuration);
      video.removeEventListener('durationchange', syncDuration);
      video.removeEventListener('canplay', syncDuration);
      video.removeEventListener('seeked', handleSeeked);
      window.removeEventListener('scroll', scheduleSeek);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('pointerdown', unlock);
      document.removeEventListener('visibilitychange', handleVisibility);
      visualViewport?.removeEventListener('resize', syncViewport);
      visualViewport?.removeEventListener('scroll', scheduleSeek);
    };
  }, []);

  return (
    <>
      {/* Mobile height is calculated from the live viewport; desktop stays full-screen. */}
      <div
        ref={videoLayerRef}
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[32svh] min-h-[164px] max-h-[320px] overflow-hidden bg-[#02143b] md:inset-0 md:h-full md:min-h-0 md:max-h-none"
        aria-hidden="true"
      >
        <video
          ref={videoRef}
          src="https://res.cloudinary.com/edtur3gp/video/upload/v1793987293/Architectural_blueprint_animatio__9f920ea2.mp4"
          muted
          playsInline
          preload="auto"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-[#02143b]/20 via-transparent to-[#02143b] md:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-b from-[#021133]/25 via-transparent to-[#021133]/35 md:block" />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]" aria-hidden="true">
        <div
          ref={progressBarRef}
          className="h-full origin-left scale-x-0 bg-gradient-to-r from-sky-400 via-sky-200 to-white shadow-[0_0_8px_rgba(125,211,252,0.8)]"
        />
      </div>
    </>
  );
}
