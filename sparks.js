import { SPARKS } from './config.js?v=20261119';

const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff2929';

const channels = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

// светлее на долю amount: ядро искры почти белое, ореол — цвет акцента
const lighten = (hex, amount) =>
  `rgb(${channels(hex).map((part) => Math.round(part + (255 - part) * amount)).join(', ')})`;

const randomBetween = (min, max) => min + Math.random() * (max - min);

export class SparkField {
  constructor(host, canvas) {
    this.host = host;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this.last = 0;
    this.width = 0;
    this.height = 0;
    this.ratio = 1;
    this.glows = new Map();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(host);
  }

  // спрайт ореола под каждый цвет акцента, чтобы не рисовать градиент на каждую искру
  glowFor(hex) {
    if (this.glows.has(hex)) return this.glows.get(hex);

    const sprite = document.createElement('canvas');
    sprite.width = 64;
    sprite.height = 64;

    const [r, g, b] = channels(hex);
    const ctx = sprite.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, `${lighten(hex, 0.6).replace('rgb', 'rgba').replace(')', ', 0.9)')}`);
    gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.34)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    this.glows.set(hex, sprite);
    return sprite;
  }

  resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width);
    const h = Math.round(height);

    if (w === this.width && h === this.height && ratio === this.ratio) return;

    this.width = w;
    this.height = h;
    this.ratio = ratio;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  burst(x, y, { count = 15, spread = 24, power = 1 } = {}) {
    const base = accentColor();
    const glow = this.glowFor(base);
    const palette = [base, base, lighten(base, 0.45), '#ffffff'];

    for (let index = 0; index < count; index += 1) {
      const cube = Math.random() < 0.28;
      const life = randomBetween(SPARKS.lifeMin, SPARKS.lifeMax) * randomBetween(0.8, 1.2);
      const sideways = Math.random() ** 2;

      this.particles.push({
        x: x + randomBetween(-spread, spread),
        y: y + randomBetween(-3, 3),
        vx: (Math.random() < 0.5 ? -1 : 1) * sideways * 145 * power,
        vy: (cube ? randomBetween(45, 165) : randomBetween(25, 120)) * power,
        size: cube ? randomBetween(3.2, 6.4) : randomBetween(1.4, 2.6),
        rotation: randomBetween(0, Math.PI),
        spin: randomBetween(-7, 7),
        life,
        age: 0,
        cube,
        color: palette[Math.floor(Math.random() * palette.length)],
        glow,
      });
    }

    if (this.particles.length > 380) {
      this.particles.splice(0, this.particles.length - 380);
    }

    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((time) => this.tick(time));
    }
  }

  tick(time) {
    const delta = Math.min((time - this.last) / 1000, 0.05);
    this.last = time;

    this.fade(delta);
    this.update(delta);
    this.draw();

    if (this.particles.length) {
      requestAnimationFrame((next) => this.tick(next));
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  fade(delta) {
    // оставляем короткий шлейф, а не стираем всё в ноль
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.42, delta * 3.2)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  update(delta) {
    const keep = [];
    const drag = Math.pow(SPARKS.drag, delta * 60);

    for (const particle of this.particles) {
      particle.age += delta * 1000;
      if (particle.age >= particle.life) continue;

      particle.vy += SPARKS.gravity * delta * 1000 * 1.6;
      particle.vx *= drag;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.rotation += particle.spin * delta;

      keep.push(particle);
    }

    this.particles = keep;
  }

  draw() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    for (const particle of this.particles) {
      const progress = particle.age / particle.life;
      const alpha = (1 - progress) * (0.9 - progress * 0.35);
      if (alpha <= 0.01) continue;

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.globalAlpha = alpha;

      const halo = particle.size * (particle.cube ? 3.6 : 4.6);
      ctx.drawImage(particle.glow, -halo / 2, -halo / 2, halo, halo);

      ctx.rotate(particle.rotation);
      ctx.globalAlpha = Math.min(1, alpha * 1.2);
      ctx.fillStyle = particle.color;

      if (particle.cube) {
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      } else {
        const size = particle.size;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }

      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
