import { useEffect, useRef } from 'react';

interface Particle {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  seed: number;
}

// A broad, pointer-led ripple with an ambient standby flow behind the login
// cards. All colors come from the app's theme.
export default function LoginBackground({ paused = false }: { paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !shell || !context) return;

    const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
    let motionAllowed = motion.matches;
    let colors: string[] = [];
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let layoutFrame = 0;
    let lastFrame = 0;
    let lastMove = -Infinity;
    let interaction = 0;
    let time = 0;
    let pointerX = 0;
    let pointerY = 0;
    let centerX = 0;
    let centerY = 0;

    function draw(now: number, animated: boolean) {
      if (!canvas || !context) return;
      const delta = Math.min(64, Math.max(1, now - lastFrame));
      lastFrame = now;
      if (animated) time += delta / 1000;
      const ease = 1 - Math.exp(-delta / 95);
      // Blend from the mouse into a slow, wandering center when it rests/leaves.
      const target = animated ? Math.exp(-Math.max(0, now - lastMove - 700) / 1200) : 0;
      interaction = animated ? interaction + (target - interaction) * (1 - Math.exp(-delta / 450)) : 0;
      const idleX = width * (0.5 + Math.sin(time * 0.18) * 0.14);
      const idleY = height * (0.5 + Math.cos(time * 0.14) * 0.1);
      const centerEase = 1 - Math.exp(-delta / (180 + (1 - interaction) * 1100));
      centerX += (idleX + (pointerX - idleX) * interaction - centerX) * centerEase;
      centerY += (idleY + (pointerY - idleY) * interaction - centerY) * centerEase;
      const strength = animated ? 0.55 + interaction * 0.45 : 0;
      const radius = Math.min(800, Math.hypot(width, height) * 0.36)
        * (1 + Math.sin(time * 0.6) * 0.075 + Math.cos(time * 0.95) * 0.035);
      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';

      for (const particle of particles) {
        const dx = particle.homeX - centerX;
        const dy = particle.homeY - centerY;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const ring = Math.exp(-Math.pow((distance - radius) / (radius * 0.19), 2));
        const interior = Math.max(0, 1 - distance / radius) * 0.16;
        const influence = (ring + interior) * strength;
        const phase = particle.seed * Math.PI * 2;
        // Gentle spatial waves keep the whole field alive, even outside the ring.
        const flowX = Math.sin(particle.homeY / height * 10 + time * 0.5 + phase * 0.25) * 9
          + Math.cos(particle.homeX / width * 7 - time * 0.3) * 5;
        const flowY = Math.cos(particle.homeX / width * 9 + time * 0.4 + phase * 0.25) * 7;
        const targetX = particle.homeX + flowX + (dx / distance * 44 - dy / distance * 20) * influence;
        const targetY = particle.homeY + flowY + (dy / distance * 44 + dx / distance * 20) * influence;
        particle.x = animated ? particle.x + (targetX - particle.x) * ease : particle.homeX;
        particle.y = animated ? particle.y + (targetY - particle.y) * ease : particle.homeY;

        const angle = Math.atan2(dy, dx) + Math.sin(phase + time * 0.25) * 0.35;
        const length = 0.6 + particle.seed * 0.7 + influence * 3.5;
        // Static dots have no directional bias; dashes emerge along the ripple.
        const reach = animated ? 0.3 + influence * length : 0;
        context.globalAlpha = Math.min(0.8, 0.1 + particle.seed * 0.12 + influence * 0.6);
        context.strokeStyle = colors[Math.floor(particle.seed * colors.length)];
        context.lineWidth = 0.8 + particle.seed * 0.6 + influence * 0.7;
        context.beginPath();
        context.moveTo(particle.x - Math.cos(angle) * reach, particle.y - Math.sin(angle) * reach);
        context.lineTo(particle.x + Math.cos(angle) * reach + 0.1, particle.y + Math.sin(angle) * reach);
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    function animate(now: number) {
      frame = 0;
      if (document.hidden || !motionAllowed || paused) return;
      // Standby paints at 30 fps; pointer interaction can use up to 60 fps.
      const interval = now - lastMove > 2500 && interaction < 0.1 ? 1000 / 30 : 1000 / 60;
      if (now - lastFrame >= interval - 1) draw(now, true);
      frame = requestAnimationFrame(animate);
    }

    function syncMotion() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = performance.now();
      if (document.hidden) {
        lastMove = -Infinity;
        return;
      }
      if (motionAllowed && !paused) frame = requestAnimationFrame(animate);
      else {
        lastMove = -Infinity;
        draw(lastFrame, false);
      }
    }

    function motionChanged(event: MediaQueryListEvent) {
      motionAllowed = event.matches;
      syncMotion();
    }

    function refresh() {
      if (!canvas || !shell || !context) return;
      const style = getComputedStyle(shell);
      colors = ['--ss-emerald', '--ss-chart-2', '--color-fg-brand-primary'].map((name) => style.getPropertyValue(name).trim());
      const nextWidth = document.documentElement.clientWidth;
      const nextHeight = window.innerHeight;
      // Bound raster memory and particle count, even on large/high-DPI displays.
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_000_000 / (nextWidth * nextHeight)));
      if (width !== nextWidth || height !== nextHeight || canvas.width !== Math.round(nextWidth * ratio)) {
        if (!width) {
          centerX = pointerX = nextWidth * 0.5;
          centerY = pointerY = nextHeight * 0.6;
        }
        width = nextWidth;
        height = nextHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const spacing = Math.max(20, Math.sqrt(width * height / 2400));
        particles = [];
        for (let y = spacing / 2, row = 0; y < height; y += spacing, row++) {
          for (let x = spacing / 2, column = 0; x < width; x += spacing, column++) {
            const noise = Math.sin((column + 1) * 127.1 + (row + 1) * 311.7) * 43758.5453;
            const seed = noise - Math.floor(noise);
            const homeX = x + (seed - 0.5) * spacing * 0.85;
            const homeY = y + (Math.sin(seed * 41.3) * 0.5) * spacing * 0.85;
            particles.push({ homeX, homeY, x: homeX, y: homeY, seed });
          }
        }
      }
      syncMotion();
    }

    function scheduleRefresh() {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; refresh(); });
    }

    function move(event: PointerEvent) {
      if (!motionAllowed || paused || document.hidden || event.pointerType !== 'mouse') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      lastMove = performance.now();
    }

    function leave() { lastMove = -Infinity; }
    refresh();
    const resize = new ResizeObserver(scheduleRefresh);
    resize.observe(shell);
    const theme = new MutationObserver(scheduleRefresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    shell.addEventListener('pointermove', move, { passive: true });
    shell.addEventListener('pointerleave', leave, { passive: true });
    window.addEventListener('resize', scheduleRefresh, { passive: true });
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', syncMotion);
    motion.addEventListener('change', motionChanged);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(layoutFrame);
      resize.disconnect();
      theme.disconnect();
      shell.removeEventListener('pointermove', move);
      shell.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', syncMotion);
      motion.removeEventListener('change', motionChanged);
    };
  }, [paused]);

  return <canvas ref={canvasRef} className="ss-login-background" aria-hidden="true" />;
}
