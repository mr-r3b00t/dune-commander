// Premium Sprite Rendering System - Dune RTS
// High-quality canvas-rendered sprites with gradients, lighting, and animation
const SpriteRenderer = {

    // ---- GLOBAL LIGHTING ----
    // Sun direction angle (radians). 0 = from north, PI/4 = from NE, etc.
    // Arrakis: harsh sun from upper-left
    LIGHT_ANGLE: -Math.PI * 0.65,
    LIGHT_INTENSITY: 1.0,

    // Get light direction vector (unit vector pointing TOWARD the light)
    _lightDir() {
        return { x: Math.sin(this.LIGHT_ANGLE), y: Math.cos(this.LIGHT_ANGLE) };
    },

    // ---- UTILITY HELPERS ----

    // Darken a hex color by a factor (0-1)
    _expandHex(hex) {
        // Expand 3-digit hex (#rgb) to 6-digit (#rrggbb)
        if (hex.length === 4) {
            return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        return hex;
    },

    _darken(hex, factor) {
        hex = this._expandHex(hex);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * (1 - factor))},${Math.floor(g * (1 - factor))},${Math.floor(b * (1 - factor))})`;
    },

    // Parse hex to RGB array
    _hexToRgb(hex) {
        hex = this._expandHex(hex);
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16)
        ];
    },

    // Lighten a hex color by a factor (0-1)
    _lighten(hex, factor) {
        hex = this._expandHex(hex);
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r + (255 - r) * factor)},${Math.floor(g + (255 - g) * factor)},${Math.floor(b + (255 - b) * factor)})`;
    },

    // Create a metallic gradient (top-left light source)
    _metalGrad(ctx, x, y, w, h, baseColor) {
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, this._lighten(baseColor, 0.35));
        grad.addColorStop(0.3, this._lighten(baseColor, 0.15));
        grad.addColorStop(0.6, baseColor);
        grad.addColorStop(1, this._darken(baseColor, 0.3));
        return grad;
    },

    // Simple skewed shadow for buildings (non-rotating)
    _shadow(ctx, cx, cy, rx, ry, skew) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.transform(1, 0, skew || 0.3, 1, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(rx * 0.2, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    // Dynamic cast shadow for units - projected based on global sun direction
    _unitShadow(ctx, cx, cy, rx, ry) {
        ctx.save();
        const ld = this._lightDir();
        // Shadow cast opposite to light
        const shadowOffX = -ld.x * rx * 0.6;
        const shadowOffY = -ld.y * ry * 0.4 + ry * 0.35;
        const shadowAngle = Math.atan2(-ld.y, -ld.x);
        ctx.translate(cx + shadowOffX, cy + shadowOffY);
        ctx.rotate(shadowAngle);
        // Soft outer shadow layers
        for (let i = 3; i >= 0; i--) {
            const spread = 1 + i * 0.18;
            const alpha = 0.055 - i * 0.01;
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * spread, ry * spread * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // Core shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 0.8, ry * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    // Ground contact darkening (ambient occlusion beneath unit)
    _groundContact(ctx, cx, cy, rx, ry) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        grad.addColorStop(0, 'rgba(0,0,0,0.18)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.06)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    // Draw rivets in a line
    _rivets(ctx, x, y, count, spacing, color) {
        ctx.fillStyle = color || 'rgba(255,255,255,0.15)';
        for (let i = 0; i < count; i++) {
            ctx.beginPath();
            ctx.arc(x + i * spacing, y, 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // Draw panel lines (subtle recessed lines)
    _panelLine(ctx, x1, y1, x2, y2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(x1, y1 + 0.7);
        ctx.lineTo(x2, y2 + 0.7);
        ctx.stroke();
        ctx.restore();
    },

    // Draw engine exhaust glow
    _exhaustGlow(ctx, ex, ey, size) {
        const t = Date.now();
        const flicker = 0.6 + Math.sin(t / 80) * 0.2 + Math.sin(t / 130) * 0.15;
        const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, size * flicker);
        grad.addColorStop(0, `rgba(255,200,80,${0.6 * flicker})`);
        grad.addColorStop(0.4, `rgba(255,120,30,${0.3 * flicker})`);
        grad.addColorStop(1, 'rgba(255,60,10,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(ex, ey, size * flicker * 1.2, size * flicker * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    // Draw a metallic barrel with sheen
    _barrel(ctx, sx, sy, ex, ey, width) {
        const angle = Math.atan2(ey - sy, ex - sx);
        const perpX = -Math.sin(angle) * width / 2;
        const perpY = Math.cos(angle) * width / 2;

        // Barrel body with gradient
        const grad = ctx.createLinearGradient(sx + perpX, sy + perpY, sx - perpX, sy - perpY);
        grad.addColorStop(0, '#888');
        grad.addColorStop(0.3, '#aaa');
        grad.addColorStop(0.5, '#ccc'); // specular highlight along barrel
        grad.addColorStop(0.7, '#999');
        grad.addColorStop(1, '#555');

        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Muzzle ring
        ctx.strokeStyle = '#777';
        ctx.lineWidth = width + 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - Math.cos(angle) * 1.5, ey - Math.sin(angle) * 1.5);
        ctx.lineTo(ex, ey);
        ctx.stroke();
    },

    // Concrete foundation pad for buildings
    _concretePad(ctx, cx, cy, pw, ph) {
        const hw = pw / 2, hh = ph / 2;
        // Pad shadow
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(cx - hw + 2, cy - hh + 2, pw, ph);
        // Main pad
        const padGrad = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
        padGrad.addColorStop(0, '#8a8a82');
        padGrad.addColorStop(0.5, '#7a7a72');
        padGrad.addColorStop(1, '#666660');
        ctx.fillStyle = padGrad;
        ctx.fillRect(cx - hw, cy - hh, pw, ph);
        // Concrete texture lines
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < pw; i += pw / 4) {
            ctx.beginPath();
            ctx.moveTo(cx - hw + i, cy - hh);
            ctx.lineTo(cx - hw + i, cy + hh);
            ctx.stroke();
        }
        for (let i = 0; i < ph; i += ph / 4) {
            ctx.beginPath();
            ctx.moveTo(cx - hw, cy - hh + i);
            ctx.lineTo(cx + hw, cy - hh + i);
            ctx.stroke();
        }
        // Pad edge highlight (top-left light)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy + hh);
        ctx.lineTo(cx - hw, cy - hh);
        ctx.lineTo(cx + hw, cy - hh);
        ctx.stroke();
        // Pad edge shadow (bottom-right)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.moveTo(cx + hw, cy - hh);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.lineTo(cx - hw, cy + hh);
        ctx.stroke();
    },

    // Blinking indicator light
    _blinkLight(ctx, lx, ly, radius, color, period) {
        const t = Date.now();
        const on = Math.sin(t / (period || 500)) > 0;
        const intensity = on ? 1 : 0.2;
        ctx.save();
        if (on) {
            ctx.shadowColor = color;
            ctx.shadowBlur = radius * 4;
        }
        ctx.fillStyle = on ? color : this._darken(color, 0.7);
        ctx.globalAlpha = intensity;
        ctx.beginPath();
        ctx.arc(lx, ly, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    },

    // Damage overlay (cracks and fire) based on hp ratio
    _damageOverlay(ctx, cx, cy, dw, dh, hpRatio) {
        if (hpRatio === undefined || hpRatio >= 0.85) return;
        ctx.save();
        const hw = dw / 2, hh = dh / 2;
        const t = Date.now();

        // Phase 1: Light damage (85-60%) - hull dents, paint scratches
        if (hpRatio < 0.85) {
            const severity = (0.85 - hpRatio) * 1.5;

            // Dent marks on hull (dark spots)
            ctx.fillStyle = `rgba(20,15,10,${Math.min(severity * 0.3, 0.3)})`;
            ctx.beginPath();
            ctx.ellipse(cx + hw * 0.2, cy - hh * 0.15, dw * 0.08, dh * 0.06, 0.3, 0, Math.PI * 2);
            ctx.fill();
            if (hpRatio < 0.75) {
                ctx.beginPath();
                ctx.ellipse(cx - hw * 0.25, cy + hh * 0.1, dw * 0.07, dh * 0.05, -0.4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Paint scratches on armor
            ctx.strokeStyle = `rgba(60,50,40,${Math.min(severity * 0.4, 0.4)})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.3, cy - hh * 0.2);
            ctx.lineTo(cx + hw * 0.1, cy - hh * 0.05);
            ctx.stroke();
            if (hpRatio < 0.7) {
                ctx.beginPath();
                ctx.moveTo(cx + hw * 0.15, cy + hh * 0.1);
                ctx.lineTo(cx - hw * 0.1, cy + hh * 0.25);
                ctx.stroke();
            }
        }

        // Phase 2: Moderate damage (60-30%) - sparks from chassis, thin smoke from engine
        if (hpRatio < 0.6) {
            const modSeverity = (0.6 - hpRatio) * 1.5;

            // Sparks flying from damaged hull
            if (Math.sin(t / 150) > 0.7) {
                ctx.strokeStyle = `rgba(255,230,100,${0.4 + Math.random() * 0.3})`;
                ctx.lineWidth = 0.6;
                const sparkX = cx + Math.sin(t / 90) * hw * 0.25;
                const sparkY = cy + Math.cos(t / 70) * hh * 0.15;
                ctx.beginPath();
                ctx.moveTo(sparkX, sparkY);
                for (let j = 0; j < 3; j++) {
                    ctx.lineTo(sparkX + (Math.random() - 0.5) * 5, sparkY + (Math.random() - 0.5) * 5);
                }
                ctx.stroke();
            }

            // Thin engine smoke rising from top of vehicle body
            const smokeAlpha = modSeverity * 0.15;
            for (let i = 0; i < 2; i++) {
                const smokeX = cx + (i - 0.5) * dw * 0.2 + Math.sin(t / 400 + i * 3) * 2;
                const smokeY = cy - hh - 2 - Math.abs(Math.sin(t / 350 + i)) * 4;
                const smokeR = 2 + modSeverity * 3;
                ctx.fillStyle = `rgba(80,75,70,${Math.min(smokeAlpha, 0.15)})`;
                ctx.beginPath();
                ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Damaged/scorched hull tint
            ctx.fillStyle = `rgba(30,15,5,${modSeverity * 0.08})`;
            ctx.fillRect(cx - hw, cy - hh, dw, dh);
        }

        // Phase 3: Heavy damage (30-0%) - engine fire on body, heavy smoke
        if (hpRatio < 0.3) {
            const critical = (0.3 - hpRatio) * 2;

            // Small flames coming from the engine/hull (on the vehicle, not below)
            const fireCount = hpRatio < 0.15 ? 2 : 1;
            for (let i = 0; i < fireCount; i++) {
                const fx = cx + (i - (fireCount - 1) / 2) * dw * 0.2;
                const fy = cy - hh * 0.2;
                const flicker = Math.sin(t / 60 + i * 2.3) * 2;
                const fsize = 3 + critical * 5;

                // Fire on hull
                const fireGrad = ctx.createRadialGradient(fx, fy + flicker, 0, fx, fy + flicker, fsize);
                fireGrad.addColorStop(0, 'rgba(255,255,200,0.7)');
                fireGrad.addColorStop(0.3, 'rgba(255,160,30,0.5)');
                fireGrad.addColorStop(0.6, 'rgba(255,60,10,0.25)');
                fireGrad.addColorStop(1, 'rgba(100,20,0,0)');
                ctx.fillStyle = fireGrad;
                ctx.beginPath();
                ctx.ellipse(fx, fy + flicker, fsize * 0.5, fsize * 0.7, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Smoke rising from the vehicle top
            for (let s = 0; s < 2; s++) {
                const sAge = (t / 350 + s * 1.8) % 2.5;
                const sX = cx + Math.sin(t / 280 + s) * hw * 0.2;
                const sY = cy - hh - 3 - sAge * 6;
                const sR = 2 + sAge * 3;
                const sAlpha = Math.max(0, 0.2 - sAge * 0.07);
                ctx.fillStyle = `rgba(50,45,40,${sAlpha})`;
                ctx.beginPath();
                ctx.arc(sX, sY, sR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Charred/blackened hull overlay
            ctx.fillStyle = `rgba(20,10,0,${critical * 0.15})`;
            ctx.fillRect(cx - hw, cy - hh, dw, dh);
        }

        ctx.restore();
    },

    // Infantry-specific damage overlay: blood splatters, wounds, limping effects
    _infantryDamageOverlay(ctx, cx, cy, dw, dh, hpRatio) {
        if (hpRatio === undefined || hpRatio >= 0.85) return;
        ctx.save();
        const hw = dw / 2, hh = dh / 2;
        const t = Date.now();

        // Phase 1: Light injury (85-60%) - small blood spatters, scuffs
        if (hpRatio < 0.85) {
            const severity = (0.85 - hpRatio) * 2;

            // Blood spatter dots
            ctx.fillStyle = `rgba(140,15,10,${Math.min(severity * 0.4, 0.5)})`;
            ctx.beginPath();
            ctx.arc(cx + hw * 0.25, cy - hh * 0.15, 1.2, 0, Math.PI * 2);
            ctx.fill();
            if (hpRatio < 0.75) {
                ctx.beginPath();
                ctx.arc(cx - hw * 0.2, cy + hh * 0.1, 1.0, 0, Math.PI * 2);
                ctx.fill();
                // Torn uniform scuff
                ctx.strokeStyle = `rgba(60,30,15,${severity * 0.3})`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(cx - hw * 0.1, cy - hh * 0.3);
                ctx.lineTo(cx + hw * 0.15, cy - hh * 0.15);
                ctx.stroke();
            }
        }

        // Phase 2: Moderate injury (60-30%) - visible wounds, blood drips, limping tint
        if (hpRatio < 0.6) {
            const woundAlpha = (0.6 - hpRatio) * 1.2;

            // Larger blood patches on body
            ctx.fillStyle = `rgba(130,10,5,${Math.min(woundAlpha * 0.35, 0.4)})`;
            ctx.beginPath();
            ctx.ellipse(cx + hw * 0.15, cy - hh * 0.05, 2.5, 1.8, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx - hw * 0.25, cy + hh * 0.2, 2, 1.5, -0.3, 0, Math.PI * 2);
            ctx.fill();

            // Blood drip trail
            ctx.strokeStyle = `rgba(120,5,0,${Math.min(woundAlpha * 0.3, 0.35)})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(cx + hw * 0.15, cy + hh * 0.1);
            ctx.quadraticCurveTo(cx + hw * 0.1, cy + hh * 0.35, cx + hw * 0.2, cy + hh * 0.55);
            ctx.stroke();

            // Wound gashes
            ctx.strokeStyle = `rgba(100,0,0,${Math.min(woundAlpha * 0.5, 0.5)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - hw * 0.3, cy - hh * 0.25);
            ctx.lineTo(cx - hw * 0.1, cy - hh * 0.1);
            ctx.stroke();

            // Pained reddish tint (slight flush)
            const flush = Math.sin(t / 800) * 0.03 + 0.06;
            ctx.fillStyle = `rgba(150,20,10,${flush * woundAlpha})`;
            ctx.fillRect(cx - hw, cy - hh, dw, dh);
        }

        // Phase 3: Critical injury (30-0%) - heavy bleeding, staggering, blood pool
        if (hpRatio < 0.3) {
            const critical = (0.3 - hpRatio) * 2;

            // Blood pool forming on ground beneath
            const poolSize = 3 + critical * 6;
            const poolAlpha = Math.min(critical * 0.25, 0.35);
            const poolGrad = ctx.createRadialGradient(cx, cy + hh * 0.5, 0, cx, cy + hh * 0.5, poolSize);
            poolGrad.addColorStop(0, `rgba(100,5,0,${poolAlpha})`);
            poolGrad.addColorStop(0.6, `rgba(80,0,0,${poolAlpha * 0.6})`);
            poolGrad.addColorStop(1, 'rgba(60,0,0,0)');
            ctx.fillStyle = poolGrad;
            ctx.beginPath();
            ctx.ellipse(cx, cy + hh * 0.5, poolSize * 1.2, poolSize * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();

            // Multiple heavy blood splatters
            const splatCount = hpRatio < 0.15 ? 4 : 2;
            for (let i = 0; i < splatCount; i++) {
                const sx = cx + Math.sin(i * 2.1 + 0.5) * hw * 0.4;
                const sy = cy + Math.cos(i * 1.7 + 0.3) * hh * 0.3;
                ctx.fillStyle = `rgba(110,5,0,${Math.min(critical * 0.3, 0.4)})`;
                ctx.beginPath();
                ctx.arc(sx, sy, 1.5 + critical * 1.5, 0, Math.PI * 2);
                ctx.fill();
                // Splatter drops radiating out
                ctx.fillStyle = `rgba(100,0,0,${Math.min(critical * 0.25, 0.3)})`;
                for (let d = 0; d < 3; d++) {
                    const angle = (i * 2 + d * 2.1);
                    const dist = 2 + critical * 2;
                    ctx.beginPath();
                    ctx.arc(sx + Math.cos(angle) * dist, sy + Math.sin(angle) * dist, 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Staggering visual - slight body sway
            const stagger = Math.sin(t / 300) * critical * 0.5;
            // Red vignette overlay (fading/weakening)
            ctx.fillStyle = `rgba(80,0,0,${critical * 0.12 + stagger * 0.02})`;
            ctx.fillRect(cx - hw, cy - hh, dw, dh);
        }

        ctx.restore();
    },

    // Top-down vehicle hull with dynamic directional lighting
    // The hull is drawn in LOCAL space (already rotated by ctx.rotate(dir))
    // Lighting must account for the unit's rotation to keep the sun direction consistent
    _topDownHull(ctx, cx, cy, w, h, colors, rounded, unitDir) {
        const hw = w / 2, hh = h / 2;
        const r = rounded || 3;
        const ld = this._lightDir();

        // Transform light direction into local space (counter-rotate by unit facing)
        // unitDir is the ctx rotation already applied, so we need to un-rotate the light
        const localLightAngle = this.LIGHT_ANGLE - (unitDir || 0);
        const llx = Math.sin(localLightAngle);
        const lly = Math.cos(localLightAngle);

        // Base fill
        const [pr, pg, pb] = this._hexToRgb(colors.primary);
        ctx.fillStyle = colors.primary;
        this._roundRect(ctx, cx - hw, cy - hh, w, h, r);
        ctx.fill();

        // Directional lighting gradient overlay - lit side is toward the light
        const lightGradX1 = cx + llx * hw;
        const lightGradY1 = cy + lly * hh;
        const lightGradX2 = cx - llx * hw;
        const lightGradY2 = cy - lly * hh;
        const lightGrad = ctx.createLinearGradient(lightGradX1, lightGradY1, lightGradX2, lightGradY2);
        lightGrad.addColorStop(0, `rgba(255,240,200,0.3)`);  // warm sun highlight
        lightGrad.addColorStop(0.3, `rgba(255,240,200,0.1)`);
        lightGrad.addColorStop(0.6, `rgba(0,0,0,0.0)`);
        lightGrad.addColorStop(1, `rgba(0,0,20,0.3)`);       // shadow side
        ctx.fillStyle = lightGrad;
        this._roundRect(ctx, cx - hw, cy - hh, w, h, r);
        ctx.fill();

        // Specular highlight - a bright hotspot on the lit side
        const specX = cx + llx * hw * 0.3;
        const specY = cy + lly * hh * 0.3;
        const specSize = Math.min(hw, hh) * 0.7;
        const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specSize);
        specGrad.addColorStop(0, 'rgba(255,255,240,0.25)');
        specGrad.addColorStop(0.5, 'rgba(255,250,230,0.08)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrad;
        this._roundRect(ctx, cx - hw, cy - hh, w, h, r);
        ctx.fill();

        // Edge highlight on lit side
        ctx.save();
        ctx.strokeStyle = `rgba(255,240,200,0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Draw highlight along the edges that face the light
        const corners = [
            { x: cx - hw + r, y: cy - hh },
            { x: cx + hw - r, y: cy - hh },
            { x: cx + hw, y: cy - hh + r },
            { x: cx + hw, y: cy + hh - r },
            { x: cx + hw - r, y: cy + hh },
            { x: cx - hw + r, y: cy + hh },
            { x: cx - hw, y: cy + hh - r },
            { x: cx - hw, y: cy - hh + r }
        ];
        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];
            const next = corners[(i + 1) % corners.length];
            // Check if this edge faces the light (dot product of edge normal with light dir)
            const edgeNx = -(next.y - c.y);
            const edgeNy = (next.x - c.x);
            const dot = edgeNx * llx + edgeNy * lly;
            if (dot > 0) {
                ctx.moveTo(c.x, c.y);
                ctx.lineTo(next.x, next.y);
            }
        }
        ctx.stroke();
        ctx.restore();

        // Dark edge on shadow side
        ctx.save();
        ctx.strokeStyle = `rgba(0,0,20,0.4)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];
            const next = corners[(i + 1) % corners.length];
            const edgeNx = -(next.y - c.y);
            const edgeNy = (next.x - c.x);
            const dot = edgeNx * llx + edgeNy * lly;
            if (dot < -0.1) {
                ctx.moveTo(c.x, c.y);
                ctx.lineTo(next.x, next.y);
            }
        }
        ctx.stroke();
        ctx.restore();
    },

    // Top-down tank track with dynamic lighting
    _topDownTrack(ctx, cx, cy, trackW, trackH, unitDir) {
        const hw = trackW / 2, hh = trackH / 2;
        // Light in local space
        const localLightAngle = this.LIGHT_ANGLE - (unitDir || 0);
        const llx = Math.sin(localLightAngle);

        // Track body - outer rubber
        ctx.fillStyle = '#1a1a1a';
        this._roundRect(ctx, cx - hw, cy - hh, trackW, trackH, 2);
        ctx.fill();

        // Inner track surface
        const tGrad = ctx.createLinearGradient(cx - hw, cy, cx + hw, cy);
        tGrad.addColorStop(0, '#222');
        tGrad.addColorStop(0.5, '#3a3a3a');
        tGrad.addColorStop(1, '#222');
        ctx.fillStyle = tGrad;
        ctx.fillRect(cx - hw + 0.8, cy - hh + 1, trackW - 1.6, trackH - 2);

        // Animated track links
        const anim = (Date.now() / 60) % 4;
        ctx.strokeStyle = 'rgba(90,85,75,0.5)';
        ctx.lineWidth = 0.8;
        for (let i = -hh + anim; i < hh; i += 3.5) {
            ctx.beginPath();
            ctx.moveTo(cx - hw + 0.5, cy + i);
            ctx.lineTo(cx + hw - 0.5, cy + i);
            ctx.stroke();
        }

        // Light reflection on track (subtle metallic sheen)
        const trackLightX = cx + llx * hw * 0.4;
        const sGrad = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy - hh);
        sGrad.addColorStop(0, 'rgba(255,240,200,0)');
        sGrad.addColorStop(Math.max(0, Math.min(1, 0.5 + llx * 0.4)), 'rgba(255,240,200,0.12)');
        sGrad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = sGrad;
        ctx.fillRect(cx - hw, cy - hh, trackW, trackH);

        // Drive wheel hubs with lighting
        for (const wy of [cy - hh + 2.5, cy + hh - 2.5]) {
            const hubGrad = ctx.createRadialGradient(cx + llx * 1, wy, 0, cx, wy, hw * 0.7);
            hubGrad.addColorStop(0, '#666');
            hubGrad.addColorStop(0.5, '#444');
            hubGrad.addColorStop(1, '#2a2a2a');
            ctx.fillStyle = hubGrad;
            ctx.beginPath();
            ctx.ellipse(cx, wy, hw * 0.65, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    // ---- UNIT DRAWING FUNCTIONS ----

    drawInfantry(ctx, x, y, dir, colors, type) {
        const isHeavy = type === 'heavy_trooper';
        ctx.save();
        ctx.translate(x, y);

        // Dynamic shadow + ground contact
        this._unitShadow(ctx, 0, 4, 7, 4);
        this._groundContact(ctx, 0, 3, 6, 3);

        const t = Date.now();
        const walk = Math.sin(t / 140) * 2;
        const breathe = Math.sin(t / 800) * 0.3;

        // Boots with shading
        const bootGrad = ctx.createLinearGradient(-3, 0, 3, 6);
        bootGrad.addColorStop(0, '#4a3a28');
        bootGrad.addColorStop(1, '#2a1a10');
        ctx.fillStyle = bootGrad;
        ctx.fillRect(-3.5, 0 + walk, 2.5, 5);
        ctx.fillRect(1, 0 - walk, 2.5, 5);
        // Boot soles
        ctx.fillStyle = '#1a1008';
        ctx.fillRect(-3.5, 4.5 + walk, 2.5, 1);
        ctx.fillRect(1, 4.5 - walk, 2.5, 1);

        // Body with gradient
        const bw = isHeavy ? 11 : 9;
        const bh = isHeavy ? 9 : 7;
        this._topDownHull(ctx, 0, -3 + breathe, bw, bh, colors, 2, 0);

        // Armor plating detail
        if (isHeavy) {
            this._panelLine(ctx, -4, -6, -4, 0);
            this._panelLine(ctx, 4, -6, 4, 0);
            this._rivets(ctx, -3, -5, 3, 3);
            // Shoulder pads
            ctx.fillStyle = this._darken(colors.primary, 0.15);
            ctx.fillRect(-5.5, -6, 3, 3);
            ctx.fillRect(2.5, -6, 3, 3);
        }
        this._panelLine(ctx, -3, -2, 3, -2);

        // Belt
        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(-4, -1, 8, 1.5);
        ctx.fillStyle = 'rgba(255,220,100,0.6)';
        ctx.fillRect(-0.5, -1, 1, 1.5); // Belt buckle

        // Head with skin gradient
        const skinGrad = ctx.createRadialGradient(-0.5, -10.5, 0, 0, -10, 4);
        skinGrad.addColorStop(0, '#e8b888');
        skinGrad.addColorStop(1, '#c09068');
        ctx.fillStyle = skinGrad;
        ctx.beginPath();
        ctx.arc(0, -10 + breathe, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Helmet with gradient
        const helmetGrad = ctx.createLinearGradient(-3, -14, 3, -9);
        helmetGrad.addColorStop(0, this._lighten(colors.dark, 0.2));
        helmetGrad.addColorStop(0.4, colors.dark);
        helmetGrad.addColorStop(1, this._darken(colors.dark, 0.3));
        ctx.fillStyle = helmetGrad;
        ctx.beginPath();
        ctx.arc(0, -11 + breathe, 3.5, Math.PI * 0.75, Math.PI * 2.25);
        ctx.fill();

        // Visor with slight reflection
        const visorGrad = ctx.createLinearGradient(-2, -11.5, 2, -10);
        visorGrad.addColorStop(0, '#444');
        visorGrad.addColorStop(0.5, '#1a1a2a');
        visorGrad.addColorStop(0.8, '#333');
        visorGrad.addColorStop(1, 'rgba(100,140,200,0.3)'); // reflection
        ctx.fillStyle = visorGrad;
        ctx.fillRect(-2.5, -11.5 + breathe, 5, 2);

        // Weapon (rotate based on facing direction)
        const wx = Math.sin(dir) * 4;
        const wy = -Math.cos(dir) * 2;
        if (isHeavy) {
            // Rocket launcher with metallic finish
            ctx.save();
            ctx.translate(wx + 3.5, -6 + wy + breathe);
            ctx.rotate(dir * 0.3);
            const rlGrad = ctx.createLinearGradient(-1.5, 0, 1.5, 0);
            rlGrad.addColorStop(0, '#777');
            rlGrad.addColorStop(0.4, '#999');
            rlGrad.addColorStop(0.6, '#888');
            rlGrad.addColorStop(1, '#555');
            ctx.fillStyle = rlGrad;
            ctx.fillRect(-1.2, 0, 2.8, -11);
            // Launcher housing
            ctx.fillStyle = '#666';
            ctx.fillRect(-2, -11, 4, 3.5);
            // Warhead glow
            ctx.save();
            ctx.shadowColor = '#ff4422';
            ctx.shadowBlur = 3;
            ctx.fillStyle = '#cc4433';
            ctx.beginPath();
            ctx.arc(0.2, -11.5, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.restore();
        } else {
            // Rifle with metallic sheen
            ctx.save();
            ctx.translate(wx + 3, -4 + wy + breathe);
            ctx.rotate(dir * 0.3);
            const rifleGrad = ctx.createLinearGradient(-1, 0, 1.5, 0);
            rifleGrad.addColorStop(0, '#555');
            rifleGrad.addColorStop(0.5, '#777');
            rifleGrad.addColorStop(1, '#444');
            ctx.fillStyle = rifleGrad;
            ctx.fillRect(0, 0, 1.8, -9);
            // Stock
            ctx.fillStyle = '#5a3a20';
            ctx.fillRect(-0.3, 0, 2, 2);
            ctx.restore();
        }

        ctx.restore();
    },

    drawRocketInfantry(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);

        // Shadow + ground contact
        this._unitShadow(ctx, 0, 4, 7, 4);
        this._groundContact(ctx, 0, 3, 6, 3);

        const t = Date.now();
        const walk = Math.sin(t / 160) * 1.8;
        const breathe = Math.sin(t / 700) * 0.3;

        // Boots - military green/khaki
        const bootGrad = ctx.createLinearGradient(-3, 0, 3, 6);
        bootGrad.addColorStop(0, '#4a4430');
        bootGrad.addColorStop(1, '#2a2618');
        ctx.fillStyle = bootGrad;
        ctx.fillRect(-3.5, 0 + walk, 2.5, 5);
        ctx.fillRect(1, 0 - walk, 2.5, 5);
        ctx.fillStyle = '#1a1808';
        ctx.fillRect(-3.5, 4.5 + walk, 2.5, 1);
        ctx.fillRect(1, 4.5 - walk, 2.5, 1);

        // Kneepads
        ctx.fillStyle = '#3a3828';
        ctx.fillRect(-3.5, -0.5 + walk, 2.5, 1.5);
        ctx.fillRect(1, -0.5 - walk, 2.5, 1.5);

        // Body - slightly lighter armor than heavy trooper
        this._topDownHull(ctx, 0, -3 + breathe, 10, 8, colors, 2, 0);

        // Chest armor plating with rocket ammo pouches
        this._panelLine(ctx, -4, -6, -4, 0);
        this._panelLine(ctx, 4, -6, 4, 0);
        // Ammo pouches across chest (distinct from heavy trooper)
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.fillRect(-4.5, -5, 2.5, 4);
        ctx.fillRect(2, -5, 2.5, 4);
        // Rocket tips visible in pouches
        ctx.fillStyle = '#cc5533';
        ctx.fillRect(-3.8, -5, 1, 1);
        ctx.fillRect(-3.8, -3.5, 1, 1);
        ctx.fillRect(2.7, -5, 1, 1);
        ctx.fillRect(2.7, -3.5, 1, 1);

        // Single shoulder pad (launcher side only)
        ctx.fillStyle = this._darken(colors.primary, 0.2);
        ctx.fillRect(2.5, -7, 3.5, 3);
        // Reinforced edge
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(2.5, -7, 3.5, 3);

        this._panelLine(ctx, -3, -2, 3, -2);

        // Belt with grenades
        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(-4, -1, 8, 1.5);
        ctx.fillStyle = 'rgba(255,220,100,0.6)';
        ctx.fillRect(-0.5, -1, 1, 1.5);
        // Grenade on belt
        ctx.fillStyle = '#445533';
        ctx.beginPath();
        ctx.arc(-2.5, -0.5, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(2.5, -0.5, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Head with skin
        const skinGrad = ctx.createRadialGradient(-0.5, -10.5, 0, 0, -10, 4);
        skinGrad.addColorStop(0, '#e8b888');
        skinGrad.addColorStop(1, '#c09068');
        ctx.fillStyle = skinGrad;
        ctx.beginPath();
        ctx.arc(0, -10 + breathe, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Helmet with blast visor (different from heavy trooper)
        const helmetGrad = ctx.createLinearGradient(-3, -14, 3, -9);
        helmetGrad.addColorStop(0, this._lighten(colors.dark, 0.15));
        helmetGrad.addColorStop(0.5, colors.dark);
        helmetGrad.addColorStop(1, this._darken(colors.dark, 0.35));
        ctx.fillStyle = helmetGrad;
        ctx.beginPath();
        ctx.arc(0, -11 + breathe, 3.5, Math.PI * 0.7, Math.PI * 2.3);
        ctx.fill();
        // Blast visor (wider, amber tint)
        const visorGrad = ctx.createLinearGradient(-3, -11.5, 3, -10);
        visorGrad.addColorStop(0, '#554422');
        visorGrad.addColorStop(0.4, '#886633');
        visorGrad.addColorStop(0.7, '#775522');
        visorGrad.addColorStop(1, 'rgba(200,160,60,0.3)');
        ctx.fillStyle = visorGrad;
        ctx.fillRect(-3, -11.5 + breathe, 6, 2.2);
        // Visor frame
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-3, -11.5 + breathe, 6, 2.2);

        // Shoulder-mounted rocket launcher (larger, on right shoulder)
        const wx = Math.sin(dir) * 3;
        const wy = -Math.cos(dir) * 1.5;
        ctx.save();
        ctx.translate(wx + 4, -7 + wy + breathe);
        ctx.rotate(dir * 0.2);

        // Launcher tube (thick, military olive)
        const tubeGrad = ctx.createLinearGradient(-2, 0, 2.5, 0);
        tubeGrad.addColorStop(0, '#556644');
        tubeGrad.addColorStop(0.3, '#778866');
        tubeGrad.addColorStop(0.7, '#667755');
        tubeGrad.addColorStop(1, '#445533');
        ctx.fillStyle = tubeGrad;
        ctx.fillRect(-1.8, 2, 3.6, -14);

        // Tube opening (dark bore)
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(0, -12, 1.5, 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sight/optics on top
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.8, -8, 1.6, 3);
        // Sight lens
        ctx.fillStyle = '#cc3322';
        ctx.beginPath();
        ctx.arc(0, -7, 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Grip/handle
        ctx.fillStyle = '#3a2a15';
        ctx.fillRect(-0.5, 0, 1.2, 3);

        // Rear exhaust warning stripes
        ctx.fillStyle = '#ccaa00';
        ctx.fillRect(-1.5, 1.5, 3, 0.5);
        ctx.fillStyle = '#222';
        ctx.fillRect(-1.5, 1, 3, 0.5);

        // Loaded rocket visible in tube
        const rocketGlow = Math.sin(t / 400) * 0.2 + 0.8;
        ctx.fillStyle = `rgba(255,80,20,${rocketGlow * 0.7})`;
        ctx.beginPath();
        ctx.ellipse(0, -11.5, 1, 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.restore();
    },

    drawCommando(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);

        // Shadow + ground contact
        this._unitShadow(ctx, 0, 4, 8, 4);
        this._groundContact(ctx, 0, 3, 7, 3);

        const t = Date.now();
        const walk = Math.sin(t / 120) * 1.5; // faster, more agile stride
        const breathe = Math.sin(t / 600) * 0.3;

        // Combat boots - dark tactical
        const bootGrad = ctx.createLinearGradient(-3, 0, 3, 6);
        bootGrad.addColorStop(0, '#2a2a2a');
        bootGrad.addColorStop(1, '#111111');
        ctx.fillStyle = bootGrad;
        ctx.fillRect(-3.5, 0 + walk, 2.8, 5);
        ctx.fillRect(0.7, 0 - walk, 2.8, 5);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(-3.5, 4.5 + walk, 2.8, 1);
        ctx.fillRect(0.7, 4.5 - walk, 2.8, 1);

        // Tactical body - dark stealth suit
        const bodyColors = { primary: '#2a2a32', secondary: '#3a3a44', dark: '#1a1a22', light: '#4a4a55' };
        this._topDownHull(ctx, 0, -3 + breathe, 10, 8, bodyColors, 2, 0);

        // Tactical vest/armor with house color trim
        ctx.fillStyle = colors.dark;
        ctx.fillRect(-4.5, -7, 9, 2);
        ctx.fillStyle = this._darken(colors.primary, 0.2);
        ctx.fillRect(-3, -6, 6, 3);
        // Cross-chest ammo belt
        ctx.strokeStyle = '#3a3020';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-4, -6);
        ctx.lineTo(3, -2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, -6);
        ctx.lineTo(-3, -2);
        ctx.stroke();
        // Ammo pouches on belt
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(-4.5, -1, 2, 1.5);
        ctx.fillRect(2.5, -1, 2, 1.5);

        // Tactical belt
        ctx.fillStyle = '#222222';
        ctx.fillRect(-4, -1, 8, 1.5);
        ctx.fillStyle = 'rgba(200,180,100,0.5)';
        ctx.fillRect(-0.5, -1, 1, 1.5);

        // Head with balaclava/face paint
        const skinGrad = ctx.createRadialGradient(-0.5, -10.5, 0, 0, -10, 4);
        skinGrad.addColorStop(0, '#5a6a4a'); // camo face paint
        skinGrad.addColorStop(1, '#3a4a2a');
        ctx.fillStyle = skinGrad;
        ctx.beginPath();
        ctx.arc(0, -10 + breathe, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Tactical beret/headgear with house color
        const beretGrad = ctx.createLinearGradient(-3, -14, 3, -10);
        beretGrad.addColorStop(0, colors.primary);
        beretGrad.addColorStop(0.5, this._darken(colors.primary, 0.15));
        beretGrad.addColorStop(1, this._darken(colors.primary, 0.3));
        ctx.fillStyle = beretGrad;
        ctx.beginPath();
        ctx.ellipse(0, -12.5 + breathe, 4, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Beret badge
        ctx.fillStyle = 'rgba(255,220,100,0.8)';
        ctx.beginPath();
        ctx.arc(0, -12.5 + breathe, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Night-vision goggles on beret (pushed up)
        ctx.fillStyle = '#333';
        ctx.fillRect(-3, -13.5 + breathe, 2.5, 1.5);
        ctx.fillRect(0.5, -13.5 + breathe, 2.5, 1.5);
        // Green lens glow
        ctx.save();
        ctx.shadowColor = '#00ff44';
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#00cc33';
        ctx.fillRect(-2.5, -13 + breathe, 1.5, 0.8);
        ctx.fillRect(1, -13 + breathe, 1.5, 0.8);
        ctx.restore();

        // Eyes - intense stare
        ctx.fillStyle = '#ddddcc';
        ctx.fillRect(-2, -10.5 + breathe, 1.5, 0.8);
        ctx.fillRect(0.5, -10.5 + breathe, 1.5, 0.8);
        ctx.fillStyle = '#111';
        ctx.fillRect(-1.5, -10.3 + breathe, 0.8, 0.6);
        ctx.fillRect(0.8, -10.3 + breathe, 0.8, 0.6);

        // Weapon: long sniper rifle with scope and bipod
        const wx = Math.sin(dir) * 4;
        const wy = -Math.cos(dir) * 2;
        ctx.save();
        ctx.translate(wx + 3.5, -5 + wy + breathe);
        ctx.rotate(dir * 0.25);

        // Rifle body (long barrel)
        const rifleGrad = ctx.createLinearGradient(-1, 0, 2, 0);
        rifleGrad.addColorStop(0, '#2a2a2a');
        rifleGrad.addColorStop(0.3, '#444');
        rifleGrad.addColorStop(0.7, '#3a3a3a');
        rifleGrad.addColorStop(1, '#222');
        ctx.fillStyle = rifleGrad;
        ctx.fillRect(-0.6, 3, 2.2, -20); // longer barrel

        // Wooden stock with cheek rest
        const stockGrad = ctx.createLinearGradient(-1, 2, 2, 6);
        stockGrad.addColorStop(0, '#5a3a18');
        stockGrad.addColorStop(0.5, '#4a2a12');
        stockGrad.addColorStop(1, '#3a2010');
        ctx.fillStyle = stockGrad;
        ctx.fillRect(-1, 2, 3, 4);
        // Rubber butt pad
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-1, 5.5, 3, 0.8);

        // Trigger guard
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(0.5, 1, 1.2, 0, Math.PI);
        ctx.stroke();

        // Magazine
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.3, -1, 1.8, 3);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 0.3;
        ctx.strokeRect(-0.3, -1, 1.8, 3);

        // Scope mount rail
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(-0.2, -12, 1.4, 6);

        // Scope body (large, long)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-0.5, -11, 2, 5.5);
        // Scope tube
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.ellipse(0.5, -11, 1.2, 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0.5, -5.5, 1, 1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Scope lens (front) — blue-purple glint
        const lensGlow = Math.sin(t / 600) * 0.15 + 0.85;
        ctx.fillStyle = `rgba(80,120,220,${lensGlow})`;
        ctx.beginPath();
        ctx.arc(0.5, -11.2, 0.9, 0, Math.PI * 2);
        ctx.fill();
        // Lens highlight
        ctx.fillStyle = `rgba(180,200,255,${lensGlow * 0.5})`;
        ctx.beginPath();
        ctx.arc(0.2, -11.5, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Long suppressor with vents
        ctx.fillStyle = '#111';
        ctx.fillRect(-0.3, -17, 1.6, 4);
        // Vent holes
        ctx.fillStyle = '#222';
        ctx.fillRect(0, -16.5, 1, 0.4);
        ctx.fillRect(0, -15.5, 1, 0.4);
        ctx.fillRect(0, -14.5, 1, 0.4);

        // Bipod legs (folded along barrel)
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-0.5, -4);
        ctx.lineTo(-1.5, -1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1.5, -4);
        ctx.lineTo(2.5, -1);
        ctx.stroke();

        ctx.restore();

        // C4/explosives pack on back
        ctx.fillStyle = '#554422';
        ctx.fillRect(-4, -4 + breathe, 3, 2.5);
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-3.5, -3.5 + breathe, 0.8, 0.8); // detonator light
        // Blinking detonator
        if (Math.sin(t / 500) > 0.5) {
            ctx.save();
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 3;
            ctx.fillStyle = '#ff3333';
            ctx.beginPath();
            ctx.arc(-3.1, -3.1 + breathe, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Rank insignia glow (elite unit indicator)
        const glowPhase = Math.sin(t / 1000) * 0.3 + 0.7;
        ctx.save();
        ctx.globalAlpha = glowPhase * 0.4;
        ctx.strokeStyle = colors.light;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -3 + breathe, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.restore();
    },

    drawDevastator(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);

        // Larger shadow — this is a big trooper
        this._unitShadow(ctx, 0, 5, 10, 5);
        this._groundContact(ctx, 0, 4, 9, 4);

        const t = Date.now();
        const walk = Math.sin(t / 200) * 1; // slow heavy stride
        const breathe = Math.sin(t / 700) * 0.3;

        // Heavy armored boots - thick and wide
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-4.5, 1 + walk, 3.5, 5.5);
        ctx.fillRect(1, 1 - walk, 3.5, 5.5);
        // Steel toecaps
        ctx.fillStyle = '#333';
        ctx.fillRect(-4.5, 5.5 + walk, 3.5, 1.2);
        ctx.fillRect(1, 5.5 - walk, 3.5, 1.2);

        // Massive armored body — wider and thicker than normal infantry
        const bodyGrad = ctx.createRadialGradient(-1, -3, 0, 0, -2, 10);
        bodyGrad.addColorStop(0, '#555');
        bodyGrad.addColorStop(0.5, '#3a3a3a');
        bodyGrad.addColorStop(1, '#222');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(-6, -8 + breathe, 12, 10);
        // Rounded shoulders
        ctx.beginPath();
        ctx.arc(-5, -7 + breathe, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, -7 + breathe, 3, 0, Math.PI * 2);
        ctx.fill();

        // House color armor plates
        const plateGrad = ctx.createLinearGradient(-5, -8, 5, 0);
        plateGrad.addColorStop(0, colors.primary);
        plateGrad.addColorStop(0.5, this._darken(colors.primary, 0.2));
        plateGrad.addColorStop(1, colors.dark);
        ctx.fillStyle = plateGrad;
        ctx.fillRect(-5, -7 + breathe, 10, 6);
        // Armor trim
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-5, -7 + breathe, 10, 6);

        // Skull/hazard insignia on chest
        ctx.fillStyle = '#ddd';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('☠', 0, -2.5 + breathe);

        // Heavy belt with ammo pouches
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-5.5, -1 + breathe, 11, 2);
        ctx.fillStyle = '#2a2218';
        ctx.fillRect(-5, 0 + breathe, 2.5, 1.5);
        ctx.fillRect(2.5, 0 + breathe, 2.5, 1.5);
        // Belt buckle
        ctx.fillStyle = '#aa8833';
        ctx.fillRect(-1, -0.5 + breathe, 2, 1.5);

        // Head — heavy helmet
        const helmetGrad = ctx.createRadialGradient(-0.5, -12, 0, 0, -11, 5);
        helmetGrad.addColorStop(0, '#4a4a4a');
        helmetGrad.addColorStop(0.5, '#333');
        helmetGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = helmetGrad;
        ctx.beginPath();
        ctx.arc(0, -11 + breathe, 4, 0, Math.PI * 2);
        ctx.fill();

        // Visor — red glowing slit
        ctx.fillStyle = '#111';
        ctx.fillRect(-3.5, -12 + breathe, 7, 2.5);
        const visorGlow = Math.sin(t / 400) * 0.15 + 0.85;
        ctx.fillStyle = `rgba(255,50,30,${visorGlow})`;
        ctx.fillRect(-3, -11.5 + breathe, 6, 1.5);
        // Visor reflection
        ctx.fillStyle = `rgba(255,150,100,${visorGlow * 0.4})`;
        ctx.fillRect(-2, -11.2 + breathe, 1.5, 0.8);

        // Helmet crest
        ctx.fillStyle = colors.primary;
        ctx.fillRect(-1, -15 + breathe, 2, 3);

        // Heavy weapon: autocannon / heavy machine gun
        const wx = Math.sin(dir) * 4;
        const wy = -Math.cos(dir) * 2;
        ctx.save();
        ctx.translate(wx + 5, -5 + wy + breathe);
        ctx.rotate(dir * 0.2);

        // Gun body — thick and heavy
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-1.5, 4, 3.5, -18);
        // Barrel shroud with cooling vents
        ctx.fillStyle = '#333';
        ctx.fillRect(-1, -14, 2.5, 8);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-0.5, -13, 1.5, 0.5);
        ctx.fillRect(-0.5, -11.5, 1.5, 0.5);
        ctx.fillRect(-0.5, -10, 1.5, 0.5);
        ctx.fillRect(-0.5, -8.5, 1.5, 0.5);

        // Ammo drum
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(-2, -2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Muzzle brake
        ctx.fillStyle = '#111';
        ctx.fillRect(-1, -16, 2.5, 2);
        ctx.fillStyle = '#222';
        ctx.fillRect(-1.5, -16.5, 3.5, 0.8);

        ctx.restore();

        // Backpack — ammo and power supply
        ctx.fillStyle = '#2a2a20';
        ctx.fillRect(-5, -5 + breathe, 3, 4);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-5, -5 + breathe, 3, 4);
        // Power indicator
        const powerBlink = Math.sin(t / 300) > 0 ? '#00ff00' : '#008800';
        ctx.fillStyle = powerBlink;
        ctx.fillRect(-4.5, -4.5 + breathe, 1, 1);

        ctx.restore();
    },

    drawTrike(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        // Dynamic shadow + ground contact (before rotation)
        this._unitShadow(ctx, 0, 4, 12, 6);
        this._groundContact(ctx, 0, 3, 10, 5);

        // Rotate entire vehicle to face direction
        ctx.rotate(dir);

        // Wheel spin animation
        const wheelSpin = t / 80;

        // Rear wheels with tread detail
        for (const wx of [-8, 8]) {
            ctx.save();
            // Tire
            const tireGrad = ctx.createRadialGradient(wx, 3, 0, wx, 3, 3.5);
            tireGrad.addColorStop(0, '#3a3a3a');
            tireGrad.addColorStop(0.6, '#222');
            tireGrad.addColorStop(1, '#1a1a1a');
            ctx.fillStyle = tireGrad;
            ctx.beginPath();
            ctx.ellipse(wx, 3, 3.5, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Hub
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.ellipse(wx, 3, 1.2, 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            // Tread marks (animated)
            ctx.strokeStyle = 'rgba(80,80,80,0.4)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 4; i++) {
                const a = wheelSpin + i * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(wx + Math.cos(a) * 2, 3 + Math.sin(a) * 1.5);
                ctx.lineTo(wx + Math.cos(a) * 3.3, 3 + Math.sin(a) * 2.3);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Front wheel
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.ellipse(0, -5, 2.5, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.ellipse(0, -5, 1, 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Axle with shading
        const axleGrad = ctx.createLinearGradient(-8, 2, 8, 3);
        axleGrad.addColorStop(0, '#444');
        axleGrad.addColorStop(0.5, '#555');
        axleGrad.addColorStop(1, '#333');
        ctx.fillStyle = axleGrad;
        ctx.fillRect(-8, 2, 16, 2.5);

        // Frame tubes connecting to front wheel
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-5, 1);
        ctx.lineTo(0, -4);
        ctx.moveTo(5, 1);
        ctx.lineTo(0, -4);
        ctx.stroke();

        // Body with dynamic directional lighting
        this._topDownHull(ctx, 0, -1, 13, 9, colors, 3, dir);

        // Armor panel lines
        this._panelLine(ctx, -5, -4, 5, -4);
        this._panelLine(ctx, -5, -1, 5, -1);
        this._rivets(ctx, -4, -5, 4, 2.5, 'rgba(255,255,255,0.1)');

        // Windshield with reflection
        const wsGrad = ctx.createLinearGradient(-2, -6, 3, -2);
        wsGrad.addColorStop(0, 'rgba(160,210,255,0.8)');
        wsGrad.addColorStop(0.3, 'rgba(100,160,230,0.6)');
        wsGrad.addColorStop(0.7, 'rgba(80,140,210,0.5)');
        wsGrad.addColorStop(1, 'rgba(180,220,255,0.3)');
        ctx.fillStyle = wsGrad;
        ctx.beginPath();
        ctx.moveTo(-2.5, -6);
        ctx.lineTo(2.5, -6);
        ctx.lineTo(3.5, -2.5);
        ctx.lineTo(-3.5, -2.5);
        ctx.closePath();
        ctx.fill();
        // Windshield frame
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Gun mount and barrel (points forward/up in local space)
        this._barrel(ctx, 0, -6, 0, -16, 2.2);

        // Engine exhaust
        this._exhaustGlow(ctx, 0, 5, 3);

        ctx.restore();
    },

    drawQuad(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 4, 13, 6);
        this._groundContact(ctx, 0, 3, 11, 5);

        // Rotate entire vehicle
        ctx.rotate(dir);

        const wheelSpin = t / 70;

        // 4 wheels with detail
        for (const [wx, wy] of [[-9, -3], [9, -3], [-9, 5], [9, 5]]) {
            const tireGrad = ctx.createRadialGradient(wx, wy, 0, wx, wy, 3.5);
            tireGrad.addColorStop(0, '#3a3a3a');
            tireGrad.addColorStop(0.7, '#222');
            tireGrad.addColorStop(1, '#181818');
            ctx.fillStyle = tireGrad;
            ctx.beginPath();
            ctx.ellipse(wx, wy, 3.5, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Hub
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.ellipse(wx, wy, 1.2, 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            // Animated tread
            ctx.strokeStyle = 'rgba(80,80,80,0.3)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 3; i++) {
                const a = wheelSpin + i * Math.PI * 2 / 3;
                ctx.beginPath();
                ctx.moveTo(wx + Math.cos(a) * 2, wy + Math.sin(a) * 1.5);
                ctx.lineTo(wx + Math.cos(a) * 3.3, wy + Math.sin(a) * 2.3);
                ctx.stroke();
            }
        }

        // Body with dynamic directional lighting
        this._topDownHull(ctx, 0, 0, 15, 11, colors, 3, dir);

        // Panel detail
        this._panelLine(ctx, -6, -3, 6, -3);
        this._panelLine(ctx, -6, 1, 6, 1);
        this._rivets(ctx, -5, -5, 5, 2.5);

        // Roll cage with metallic tubes
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-5, -7);
        ctx.lineTo(-5, -11);
        ctx.lineTo(5, -11);
        ctx.lineTo(5, -7);
        ctx.stroke();
        // Cross brace
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-5, -11);
        ctx.lineTo(5, -7);
        ctx.moveTo(5, -11);
        ctx.lineTo(-5, -7);
        ctx.stroke();

        // Windshield with reflection gradient
        const wsGrad = ctx.createLinearGradient(-4, -11, 4, -8);
        wsGrad.addColorStop(0, 'rgba(160,210,255,0.7)');
        wsGrad.addColorStop(0.5, 'rgba(90,150,220,0.5)');
        wsGrad.addColorStop(1, 'rgba(180,220,255,0.3)');
        ctx.fillStyle = wsGrad;
        ctx.fillRect(-4, -10.5, 8, 3.5);

        // Twin gun barrels (point forward/up in local space)
        for (const off of [-1.5, 1.5]) {
            this._barrel(ctx, off, -7, off, -18, 2);
        }

        // Muzzle flash indicator (subtle glow at barrel tips)
        const muzzleGlow = Math.sin(t / 100) * 0.15 + 0.1;
        const gx = 0;
        const gy2 = -18;
        ctx.save();
        ctx.shadowColor = 'rgba(255,200,50,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = `rgba(255,220,100,${muzzleGlow})`;
        ctx.beginPath();
        ctx.arc(gx, gy2, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Rear exhaust
        this._exhaustGlow(ctx, 0, 6, 3.5);

        ctx.restore();
    },

    drawCombatTank(ctx, x, y, dir, colors, turretDir) {
        if (turretDir === undefined) turretDir = dir;
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 5, 15, 7);
        this._groundContact(ctx, 0, 4, 13, 6);

        // Rotate entire tank hull
        ctx.rotate(dir);

        // Tracks with directional lighting
        this._topDownTrack(ctx, -10, 0, 5, 17, dir);
        this._topDownTrack(ctx, 10, 0, 5, 17, dir);

        // Hull with dynamic lighting
        this._topDownHull(ctx, 0, 0, 16, 15, colors, 2, dir);

        // Hull armor detail
        this._panelLine(ctx, -8, -5, 8, -5);
        this._panelLine(ctx, -8, -1, 8, -1);
        this._panelLine(ctx, -8, 3, 8, 3);
        this._rivets(ctx, -7, -6, 7, 2.2);
        this._rivets(ctx, -7, 4, 7, 2.2);

        // Engine deck vents
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        for (let i = -5; i <= 5; i += 2) {
            ctx.beginPath();
            ctx.moveTo(i, 2);
            ctx.lineTo(i, 5);
            ctx.stroke();
        }

        // Engine exhaust (part of hull)
        this._exhaustGlow(ctx, 0, 7, 4);

        // === Turret (rotates independently) ===
        // Undo body rotation, apply turret rotation
        ctx.rotate(-dir);
        ctx.rotate(turretDir);

        // Turret base ring with gradient
        const tBaseGrad = ctx.createRadialGradient(0, -5, 0, 0, -5, 7);
        tBaseGrad.addColorStop(0, this._lighten(colors.secondary, 0.1));
        tBaseGrad.addColorStop(0.7, colors.secondary);
        tBaseGrad.addColorStop(1, this._darken(colors.secondary, 0.2));
        ctx.fillStyle = tBaseGrad;
        ctx.beginPath();
        ctx.ellipse(0, -5, 7, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret top with lighting gradient
        const tTopGrad = ctx.createLinearGradient(-5, -9, 5, -5);
        tTopGrad.addColorStop(0, this._lighten(colors.primary, 0.25));
        tTopGrad.addColorStop(0.4, colors.primary);
        tTopGrad.addColorStop(1, this._darken(colors.primary, 0.2));
        ctx.fillStyle = tTopGrad;
        ctx.beginPath();
        ctx.ellipse(0, -7.5, 5.5, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret armor line
        this._panelLine(ctx, -4, -7.5, 4, -7.5);

        // Cannon barrel (points forward/up in turret space)
        this._barrel(ctx, 0, -7.5, 0, -23, 3.2);

        // Commander hatch
        const hatchGrad = ctx.createRadialGradient(0, -8, 0, 0, -8, 2.5);
        hatchGrad.addColorStop(0, '#555');
        hatchGrad.addColorStop(0.5, '#3a3a3a');
        hatchGrad.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = hatchGrad;
        ctx.beginPath();
        ctx.ellipse(0, -8, 2.5, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hatch handle
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-1.5, -8);
        ctx.lineTo(1.5, -8);
        ctx.stroke();

        // Antenna wobble
        const wobble = Math.sin(t / 200) * 1.5;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(3, -8);
        ctx.quadraticCurveTo(3.5 + wobble * 0.5, -13, 3 + wobble, -17);
        ctx.stroke();
        // Antenna tip
        ctx.fillStyle = '#f44';
        ctx.beginPath();
        ctx.arc(3 + wobble, -17, 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    },

    drawSiegeTank(ctx, x, y, dir, colors, turretDir) {
        if (turretDir === undefined) turretDir = dir;
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 5, 16, 8);
        this._groundContact(ctx, 0, 4, 14, 7);

        // Rotate entire hull
        ctx.rotate(dir);

        // Heavy tracks with lighting
        this._topDownTrack(ctx, -12, 0, 6, 20, dir);
        this._topDownTrack(ctx, 12, 0, 6, 20, dir);

        // Massive hull with dynamic lighting
        this._topDownHull(ctx, 0, 0, 20, 18, colors, 2, dir);

        // Heavy armor plates
        this._panelLine(ctx, -9, -6, 9, -6);
        this._panelLine(ctx, -9, -2, 9, -2);
        this._panelLine(ctx, -9, 2, 9, 2);
        this._panelLine(ctx, -9, 5, 9, 5);

        // Rivet rows
        this._rivets(ctx, -8, -7, 8, 2);
        this._rivets(ctx, -8, 6, 8, 2);

        // Side armor skirts
        ctx.fillStyle = this._darken(colors.dark, 0.15);
        ctx.fillRect(-11, -2, 2, 8);
        ctx.fillRect(9, -2, 2, 8);

        // Engine deck with vents
        ctx.fillStyle = this._darken(colors.primary, 0.1);
        ctx.fillRect(-7, 3, 14, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        for (let i = -6; i <= 6; i += 1.5) {
            ctx.beginPath();
            ctx.moveTo(i, 3);
            ctx.lineTo(i, 7);
            ctx.stroke();
        }

        // Double exhaust (part of hull)
        this._exhaustGlow(ctx, -4, 8, 3.5);
        this._exhaustGlow(ctx, 4, 8, 3.5);

        // === Turret (rotates independently) ===
        ctx.rotate(-dir);
        ctx.rotate(turretDir);

        // Turret base
        const tBaseGrad = ctx.createRadialGradient(0, -6, 0, 0, -6, 8);
        tBaseGrad.addColorStop(0, this._lighten(colors.secondary, 0.15));
        tBaseGrad.addColorStop(0.7, colors.secondary);
        tBaseGrad.addColorStop(1, this._darken(colors.secondary, 0.2));
        ctx.fillStyle = tBaseGrad;
        ctx.beginPath();
        ctx.ellipse(0, -6, 8, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret top
        const tTopGrad = ctx.createLinearGradient(-6, -10, 6, -6);
        tTopGrad.addColorStop(0, this._lighten(colors.primary, 0.3));
        tTopGrad.addColorStop(0.4, colors.primary);
        tTopGrad.addColorStop(1, this._darken(colors.primary, 0.25));
        ctx.fillStyle = tTopGrad;
        ctx.beginPath();
        ctx.ellipse(0, -9, 7, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret panel lines
        this._panelLine(ctx, -5, -9, 5, -9);
        this._rivets(ctx, -4, -10, 4, 2.5);

        // Dual cannon barrels (point forward in turret space)
        for (const offset of [-2.5, 2.5]) {
            this._barrel(ctx, offset, -9, offset, -27, 2.8);
        }

        // Commander hatch
        const hatchGrad = ctx.createRadialGradient(0, -9.5, 0, 0, -9.5, 3);
        hatchGrad.addColorStop(0, '#555');
        hatchGrad.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = hatchGrad;
        ctx.beginPath();
        ctx.ellipse(0, -9.5, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hatch periscope
        ctx.fillStyle = '#444';
        ctx.fillRect(-0.5, -10.5, 1, -2);
        ctx.fillStyle = 'rgba(120,180,255,0.6)';
        ctx.fillRect(-1, -13, 2, 1);

        // Antenna
        const wobble = Math.sin(t / 180) * 2;
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(4, -9);
        ctx.quadraticCurveTo(4.5 + wobble * 0.3, -15, 4 + wobble, -20);
        ctx.stroke();

        ctx.restore();
    },

    drawMissileTank(ctx, x, y, dir, colors, turretDir) {
        if (turretDir === undefined) turretDir = dir;
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 5, 14, 7);
        this._groundContact(ctx, 0, 4, 12, 6);

        // Rotate entire hull
        ctx.rotate(dir);

        // Tracks with lighting
        this._topDownTrack(ctx, -10, 0, 5, 17, dir);
        this._topDownTrack(ctx, 10, 0, 5, 17, dir);

        // Hull with dynamic lighting
        this._topDownHull(ctx, 0, 0, 16, 13, colors, 2, dir);

        // Panel detail
        this._panelLine(ctx, -7, -4, 7, -4);
        this._panelLine(ctx, -7, 0, 7, 0);
        this._rivets(ctx, -6, -5, 6, 2.2);

        // Engine exhaust (part of hull)
        this._exhaustGlow(ctx, 0, 7, 3);

        // === Missile launcher (rotates independently) ===
        ctx.rotate(-dir);
        ctx.rotate(turretDir);

        // Missile rack platform with gradient
        const rackGrad = ctx.createLinearGradient(-6, -10, 6, -6);
        rackGrad.addColorStop(0, '#666');
        rackGrad.addColorStop(0.5, '#555');
        rackGrad.addColorStop(1, '#444');
        ctx.fillStyle = rackGrad;
        ctx.fillRect(-6, -8, 12, 6);
        // Rack edge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(6, -8);
        ctx.stroke();

        // Launcher rail with depth
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(-6, -10, 12, 2.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-6, -10, 12, 2.5);

        // Missiles with glow tips (angled slightly forward in turret space)
        for (let i = -1; i <= 1; i++) {
            const mx = i * 3.5;
            ctx.save();
            ctx.translate(mx, -10);
            ctx.rotate(-0.08);

            // Missile body with metallic gradient
            const msGrad = ctx.createLinearGradient(-1.2, 0, 1.2, 0);
            msGrad.addColorStop(0, '#999');
            msGrad.addColorStop(0.3, '#bbb');
            msGrad.addColorStop(0.7, '#aaa');
            msGrad.addColorStop(1, '#777');
            ctx.fillStyle = msGrad;
            ctx.fillRect(-1.2, 0, 2.4, -8);

            // Warhead with glow
            ctx.save();
            ctx.shadowColor = '#ff3300';
            ctx.shadowBlur = 4;
            const tipGrad = ctx.createLinearGradient(0, -10, 0, -7);
            tipGrad.addColorStop(0, '#ff4422');
            tipGrad.addColorStop(0.5, '#cc3322');
            tipGrad.addColorStop(1, '#992211');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.moveTo(-1.2, -8);
            ctx.lineTo(0, -10.5);
            ctx.lineTo(1.2, -8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Fins
            ctx.fillStyle = '#666';
            ctx.fillRect(-2.2, -1.5, 1.2, 2.5);
            ctx.fillRect(1, -1.5, 1.2, 2.5);

            ctx.restore();
        }

        // Antenna
        const wobble = Math.sin(t / 250) * 1;
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-5, -8);
        ctx.quadraticCurveTo(-5 + wobble * 0.3, -13, -5 + wobble, -16);
        ctx.stroke();

        ctx.restore();
    },

    drawHarvester(ctx, x, y, dir, colors, spicePct) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 5, 16, 8);
        this._groundContact(ctx, 0, 4, 14, 7);

        // Rotate entire vehicle
        ctx.rotate(dir);

        // Heavy duty tracks with lighting
        this._topDownTrack(ctx, -12, 1, 6, 20, dir);
        this._topDownTrack(ctx, 12, 1, 6, 20, dir);

        // Hull with dynamic lighting
        this._topDownHull(ctx, 0, 1, 20, 15, colors, 2, dir);

        // Panel detail
        this._panelLine(ctx, -9, -3, 9, -3);
        this._panelLine(ctx, -9, 1, 9, 1);
        this._rivets(ctx, -8, -4, 8, 2.2);

        // Spice hopper with depth
        const hopperGrad = ctx.createLinearGradient(-8, -4, 8, 6);
        hopperGrad.addColorStop(0, '#3a3a3a');
        hopperGrad.addColorStop(0.5, '#2a2a2a');
        hopperGrad.addColorStop(1, '#222');
        ctx.fillStyle = hopperGrad;
        ctx.fillRect(-8, -4, 16, 9);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-8, -4, 16, 9);

        // Hopper rivet lines
        this._rivets(ctx, -7, -3, 7, 2.2, 'rgba(255,255,255,0.08)');

        if (spicePct > 0) {
            const fillH = Math.floor(9 * spicePct);
            const spiceGrad = ctx.createLinearGradient(0, 5 - fillH, 0, 5);
            spiceGrad.addColorStop(0, '#f0b040');
            spiceGrad.addColorStop(0.3, '#e09030');
            spiceGrad.addColorStop(1, '#b06020');
            ctx.fillStyle = spiceGrad;
            ctx.fillRect(-7, 5 - fillH, 14, fillH);

            // Spice surface texture
            if (fillH > 2) {
                ctx.fillStyle = 'rgba(255,180,60,0.3)';
                for (let sx = -6; sx < 7; sx += 3) {
                    ctx.beginPath();
                    ctx.arc(sx, 5 - fillH + 1, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Glow when full
            if (spicePct > 0.8) {
                ctx.save();
                ctx.shadowColor = '#e09030';
                ctx.shadowBlur = 6;
                ctx.strokeStyle = 'rgba(240,160,50,0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(-7, 5 - fillH, 14, fillH);
                ctx.restore();
            }
        }

        // Harvesting scoop with metallic gradient
        const scoopGrad = ctx.createLinearGradient(-10, -7, 10, -5);
        scoopGrad.addColorStop(0, '#999');
        scoopGrad.addColorStop(0.3, '#bbb');
        scoopGrad.addColorStop(0.7, '#999');
        scoopGrad.addColorStop(1, '#666');
        ctx.fillStyle = scoopGrad;
        ctx.fillRect(-10, -7, 20, 3.5);

        // Scoop teeth with individual metallic finish
        for (let i = -9; i <= 8; i += 3) {
            const toothGrad = ctx.createLinearGradient(i, -10, i + 2, -7);
            toothGrad.addColorStop(0, '#ccc');
            toothGrad.addColorStop(0.5, '#aaa');
            toothGrad.addColorStop(1, '#888');
            ctx.fillStyle = toothGrad;
            ctx.fillRect(i, -10, 2, 3.5);
        }

        // Cabin with gradient
        const cabGrad = ctx.createLinearGradient(-6, -10, 6, -5);
        cabGrad.addColorStop(0, this._lighten(colors.dark, 0.2));
        cabGrad.addColorStop(0.4, colors.dark);
        cabGrad.addColorStop(1, this._darken(colors.dark, 0.3));
        ctx.fillStyle = cabGrad;
        this._roundRect(ctx, -6, -10, 12, 6, 1.5);
        ctx.fill();

        // Windshield with reflection
        const cabWsGrad = ctx.createLinearGradient(-4, -9, 4, -6);
        cabWsGrad.addColorStop(0, 'rgba(160,210,255,0.7)');
        cabWsGrad.addColorStop(0.4, 'rgba(100,160,230,0.5)');
        cabWsGrad.addColorStop(1, 'rgba(180,220,255,0.3)');
        ctx.fillStyle = cabWsGrad;
        ctx.fillRect(-4.5, -9, 9, 3.5);
        // Windshield divider
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(0, -5.5);
        ctx.stroke();

        // Exhaust stack with smoke
        const stackGrad = ctx.createLinearGradient(7, -6, 9, -6);
        stackGrad.addColorStop(0, '#666');
        stackGrad.addColorStop(0.5, '#888');
        stackGrad.addColorStop(1, '#555');
        ctx.fillStyle = stackGrad;
        ctx.fillRect(7, -6, 2.5, -6);
        // Stack cap
        ctx.fillStyle = '#777';
        ctx.fillRect(6.5, -12.5, 3.5, 1.5);

        // Smoke puffs
        const smokePhase = t / 300;
        ctx.fillStyle = 'rgba(140,135,125,0.2)';
        for (let i = 0; i < 3; i++) {
            const sy = -14 - i * 4 + Math.sin(smokePhase + i) * 1.5;
            const sx = 8.2 + Math.sin(smokePhase * 0.7 + i * 2) * 2;
            const sr = 2 + i * 1.2;
            ctx.globalAlpha = 0.2 - i * 0.05;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Warning light on cabin roof
        this._blinkLight(ctx, 0, -11, 1.2, '#ffaa00', 600);

        ctx.restore();
    },

    drawMCV(ctx, x, y, dir, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._unitShadow(ctx, 0, 5, 16, 8);
        this._groundContact(ctx, 0, 4, 14, 7);

        // Rotate entire vehicle
        ctx.rotate(dir);

        // Heavy tracks with lighting
        this._topDownTrack(ctx, -13, 0, 6, 20, dir);
        this._topDownTrack(ctx, 13, 0, 6, 20, dir);

        // Massive hull with dynamic lighting
        this._topDownHull(ctx, 0, 0, 22, 18, colors, 2, dir);

        // Hull panel lines
        this._panelLine(ctx, -10, -5, 10, -5);
        this._panelLine(ctx, -10, -1, 10, -1);
        this._panelLine(ctx, -10, 3, 10, 3);
        this._rivets(ctx, -9, -6, 9, 2.2);
        this._rivets(ctx, -9, 4, 9, 2.2);

        // Building module with gradient
        const modGrad = ctx.createLinearGradient(-8, -8, 8, 3);
        modGrad.addColorStop(0, this._lighten(colors.secondary, 0.15));
        modGrad.addColorStop(0.4, colors.secondary);
        modGrad.addColorStop(1, this._darken(colors.secondary, 0.2));
        ctx.fillStyle = modGrad;
        ctx.fillRect(-8, -7, 16, 10);
        ctx.strokeStyle = this._darken(colors.dark, 0.1);
        ctx.lineWidth = 1;
        ctx.strokeRect(-8, -7, 16, 10);

        // Module panel seams
        this._panelLine(ctx, -8, -3, 8, -3);
        this._panelLine(ctx, 0, -7, 0, 3);

        // Glowing windows
        const windowGlow = Math.sin(t / 1200) * 0.15 + 0.55;
        ctx.save();
        ctx.shadowColor = 'rgba(120,180,255,0.4)';
        ctx.shadowBlur = 3;
        const winGrad = ctx.createLinearGradient(0, -6, 0, -3);
        winGrad.addColorStop(0, `rgba(140,200,255,${windowGlow})`);
        winGrad.addColorStop(0.5, `rgba(100,160,230,${windowGlow * 0.8})`);
        winGrad.addColorStop(1, `rgba(80,140,210,${windowGlow * 0.6})`);
        ctx.fillStyle = winGrad;
        ctx.fillRect(-6, -6, 5, 3);
        ctx.fillRect(1, -6, 5, 3);
        ctx.fillRect(-6, -2, 5, 2.5);
        ctx.fillRect(1, -2, 5, 2.5);
        ctx.restore();

        // Window frames
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-6, -6, 5, 3);
        ctx.strokeRect(1, -6, 5, 3);
        ctx.strokeRect(-6, -2, 5, 2.5);
        ctx.strokeRect(1, -2, 5, 2.5);

        // Crane with metallic gradient
        const craneGrad = ctx.createLinearGradient(-1, -10, 2, -10);
        craneGrad.addColorStop(0, '#cc9922');
        craneGrad.addColorStop(0.5, '#ddaa33');
        craneGrad.addColorStop(1, '#aa7711');
        ctx.strokeStyle = craneGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, -22);
        ctx.stroke();

        // Crane boom
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(-8, -19);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(8, -19);
        ctx.stroke();

        // Crane lattice
        ctx.strokeStyle = 'rgba(180,140,40,0.4)';
        ctx.lineWidth = 0.5;
        for (let i = -18; i > -22; i -= 2) {
            ctx.beginPath();
            ctx.moveTo(-1, i);
            ctx.lineTo(1, i);
            ctx.stroke();
        }

        // Cable with slight sway
        const sway = Math.sin(t / 600) * 1.5;
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-7, -19);
        ctx.quadraticCurveTo(-7 + sway, -15, -7, -12);
        ctx.stroke();

        // Hook
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.arc(-7, -11.5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(-7, -10, 1.5, 0, Math.PI);
        ctx.stroke();

        // Status lights
        this._blinkLight(ctx, -3, -7.5, 1, '#00ff44', 700);
        this._blinkLight(ctx, 3, -7.5, 1, '#ff4400', 1100);

        // Exhaust
        this._exhaustGlow(ctx, -5, 8, 3);
        this._exhaustGlow(ctx, 5, 8, 3);

        ctx.restore();
    },

    // ---- BUILDING DRAWING FUNCTIONS ----

    drawConstructionYard(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const hw = w / 2, hh = h / 2;
        const t = Date.now();

        // Ground shadow
        this._shadow(ctx, 0, hh * 0.3, hw * 0.95, hh * 0.55, 0.2);

        // Concrete foundation
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main building body with gradient
        this._isoBox(ctx, 0, -6, w * 0.72, h * 0.68, 16,
            colors.primary, colors.dark, colors.secondary);

        // Building wall panel detail
        this._panelLine(ctx, -w * 0.3, -16, -w * 0.3, -2);
        this._panelLine(ctx, w * 0.3, -16, w * 0.3, -2);
        this._panelLine(ctx, -w * 0.3, -10, w * 0.3, -10);
        this._rivets(ctx, -w * 0.28, -18, 5, w * 0.14);

        // Construction bay door with metallic gradient
        const doorGrad = ctx.createLinearGradient(-w * 0.2, -2, w * 0.2, h * 0.2);
        doorGrad.addColorStop(0, '#333');
        doorGrad.addColorStop(0.3, '#2a2a2a');
        doorGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = doorGrad;
        ctx.fillRect(-w * 0.22, -2, w * 0.44, h * 0.22);
        // Door segments with highlight
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) {
            const dsy = -2 + i * (h * 0.044);
            ctx.beginPath();
            ctx.moveTo(-w * 0.22, dsy);
            ctx.lineTo(w * 0.22, dsy);
            ctx.stroke();
        }
        // Door frame highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w * 0.22, h * 0.2);
        ctx.lineTo(-w * 0.22, -2);
        ctx.lineTo(w * 0.22, -2);
        ctx.stroke();

        // Warning stripes on door frame
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(-w * 0.22, -3, w * 0.44, 1.5);

        // Crane tower with metallic gradient
        const craneX = w * 0.12;
        ctx.strokeStyle = '#bb9922';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(craneX, -20);
        ctx.lineTo(craneX, -42);
        ctx.stroke();
        // Crane lattice detail
        ctx.strokeStyle = 'rgba(180,140,30,0.3)';
        ctx.lineWidth = 0.5;
        for (let i = -22; i > -42; i -= 3) {
            ctx.beginPath();
            ctx.moveTo(craneX - 2, i);
            ctx.lineTo(craneX + 2, i);
            ctx.stroke();
        }

        // Crane boom
        ctx.strokeStyle = '#bb9922';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(craneX, -42);
        ctx.lineTo(-w * 0.28, -38);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(craneX, -42);
        ctx.lineTo(w * 0.32, -38);
        ctx.stroke();

        // Counter-weight
        ctx.fillStyle = '#888';
        ctx.fillRect(w * 0.28, -39, 5, 3);

        // Cable with sway
        const sway = Math.sin(t / 700) * 2;
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-w * 0.22, -38);
        ctx.quadraticCurveTo(-w * 0.22 + sway, -30, -w * 0.22, -24);
        ctx.stroke();
        // Hook
        ctx.fillStyle = '#999';
        ctx.beginPath();
        ctx.arc(-w * 0.22, -23, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Glowing windows
        const winGlow = Math.sin(t / 1500) * 0.1 + 0.5;
        ctx.save();
        ctx.shadowColor = 'rgba(120,180,255,0.3)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = `rgba(130,190,255,${winGlow})`;
        ctx.fillRect(-w * 0.26, -16, w * 0.13, h * 0.09);
        ctx.fillRect(w * 0.13, -16, w * 0.13, h * 0.09);
        ctx.restore();

        // Roof edge detail
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.fillRect(-w * 0.32, -20, w * 0.64, 2.5);
        this._rivets(ctx, -w * 0.3, -19, 5, w * 0.14);

        // Status lights
        this._blinkLight(ctx, -w * 0.15, -20, 1.5, '#00ff44', 800);
        this._blinkLight(ctx, w * 0.15, -20, 1.5, '#ffaa00', 1200);

        ctx.restore();
    },

    drawWindTrap(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.48, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Building body with gradient
        this._isoBox(ctx, 0, -4, w * 0.78, h * 0.62, 12,
            colors.primary, colors.dark, colors.secondary);

        // Panel detail
        this._panelLine(ctx, -w * 0.35, -12, -w * 0.35, 0);
        this._panelLine(ctx, w * 0.35, -12, w * 0.35, 0);
        this._rivets(ctx, -w * 0.32, -14, 5, w * 0.16);

        // Large intake vents with depth
        for (const vx of [-w * 0.27, w * 0.08]) {
            const ventGrad = ctx.createLinearGradient(vx, -13, vx + w * 0.22, -4);
            ventGrad.addColorStop(0, '#2a2a2a');
            ventGrad.addColorStop(0.5, '#1a1a1a');
            ventGrad.addColorStop(1, '#333');
            ctx.fillStyle = ventGrad;
            ctx.fillRect(vx, -13, w * 0.22, h * 0.32);
            // Vent slats with metallic finish
            for (let i = 0; i < 6; i++) {
                const vy = -13 + i * (h * 0.052);
                const slatGrad = ctx.createLinearGradient(vx, vy, vx + w * 0.22, vy + 1);
                slatGrad.addColorStop(0, '#666');
                slatGrad.addColorStop(0.5, '#777');
                slatGrad.addColorStop(1, '#555');
                ctx.fillStyle = slatGrad;
                ctx.fillRect(vx + 1, vy, w * 0.2, 1.5);
            }
        }

        // Central turbine housing dome
        const domeGrad = ctx.createRadialGradient(-w * 0.02, -17, 0, 0, -15, w * 0.16);
        domeGrad.addColorStop(0, this._lighten(colors.secondary, 0.3));
        domeGrad.addColorStop(0.5, colors.secondary);
        domeGrad.addColorStop(1, this._darken(colors.secondary, 0.2));
        ctx.fillStyle = domeGrad;
        ctx.beginPath();
        ctx.arc(0, -15, w * 0.16, Math.PI, 0);
        ctx.fill();

        // Inner dome
        const innerGrad = ctx.createRadialGradient(-1, -16, 0, 0, -15, w * 0.12);
        innerGrad.addColorStop(0, this._lighten(colors.primary, 0.2));
        innerGrad.addColorStop(1, colors.primary);
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(0, -15, w * 0.12, Math.PI, 0);
        ctx.fill();

        // Spinning fan blades with thickness
        const fanAngle = t / 200;
        const bladeCount = 4;
        for (let i = 0; i < bladeCount; i++) {
            const a = fanAngle + (i * Math.PI * 2 / bladeCount);
            const bx = Math.cos(a) * w * 0.1;
            const by = Math.sin(a) * h * 0.07;
            // Blade with gradient
            const bladeGrad = ctx.createLinearGradient(0, -15, bx, -15 + by);
            bladeGrad.addColorStop(0, '#eee');
            bladeGrad.addColorStop(0.5, '#ccc');
            bladeGrad.addColorStop(1, '#aaa');
            ctx.strokeStyle = bladeGrad;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(bx, -15 + by);
            ctx.stroke();
        }
        // Hub
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(0, -15, 2, 0, Math.PI * 2);
        ctx.fill();

        // Exhaust pipes with metallic gradient
        for (const px of [w * 0.22, -w * 0.27]) {
            const pipeGrad = ctx.createLinearGradient(px, -10, px + 3, -10);
            pipeGrad.addColorStop(0, '#777');
            pipeGrad.addColorStop(0.5, '#999');
            pipeGrad.addColorStop(1, '#666');
            ctx.fillStyle = pipeGrad;
            ctx.fillRect(px, -11, 3.5, -10);
            // Pipe cap
            ctx.fillStyle = '#888';
            ctx.fillRect(px - 0.5, -21.5, 4.5, 2);
        }

        // Steam from exhaust
        const steamPhase = t / 400;
        ctx.fillStyle = 'rgba(200,200,200,0.12)';
        for (let i = 0; i < 2; i++) {
            const sy = -24 - i * 3 + Math.sin(steamPhase + i) * 1;
            ctx.beginPath();
            ctx.arc(w * 0.24 + Math.sin(steamPhase * 0.5) * 1, sy, 2 + i, 0, Math.PI * 2);
            ctx.fill();
        }

        // Power indicator
        this._blinkLight(ctx, 0, -3, 1.5, '#00ccff', 500);

        ctx.restore();
    },

    drawRefinery(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.5, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main processing building
        this._isoBox(ctx, -w * 0.12, -4, w * 0.52, h * 0.62, 14,
            colors.primary, colors.dark, colors.secondary);

        // Building panel detail
        this._panelLine(ctx, -w * 0.35, -14, -w * 0.35, 2);
        this._panelLine(ctx, w * 0.13, -14, w * 0.13, 2);
        this._rivets(ctx, -w * 0.33, -16, 4, w * 0.14);

        // Unloading bay
        const bayGrad = ctx.createLinearGradient(w * 0.12, -2, w * 0.4, h * 0.35);
        bayGrad.addColorStop(0, '#3a3a3a');
        bayGrad.addColorStop(0.5, '#2a2a2a');
        bayGrad.addColorStop(1, '#333');
        ctx.fillStyle = bayGrad;
        ctx.fillRect(w * 0.13, -2, w * 0.3, h * 0.36);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(w * 0.13, -2, w * 0.3, h * 0.36);

        // Bay entrance (dark opening)
        ctx.fillStyle = '#151515';
        ctx.fillRect(w * 0.17, 0, w * 0.22, h * 0.26);
        // Bay hazard stripes
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(w * 0.13, -3, w * 0.3, 1.5);

        // Processing towers (cylindrical) with gradient
        // Main tower
        const towerGrad1 = ctx.createLinearGradient(-w * 0.2 - 7, -18, -w * 0.2 + 7, -8);
        towerGrad1.addColorStop(0, this._lighten(colors.secondary, 0.15));
        towerGrad1.addColorStop(0.3, colors.secondary);
        towerGrad1.addColorStop(0.7, colors.dark);
        towerGrad1.addColorStop(1, this._darken(colors.dark, 0.2));
        ctx.fillStyle = towerGrad1;
        ctx.fillRect(-w * 0.2 - 7, -18, 14, 10);
        // Tower top cap
        ctx.fillStyle = this._lighten(colors.secondary, 0.1);
        ctx.beginPath();
        ctx.ellipse(-w * 0.2, -18, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tower bottom
        ctx.fillStyle = colors.secondary;
        ctx.beginPath();
        ctx.ellipse(-w * 0.2, -8, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tower rivets
        this._rivets(ctx, -w * 0.2 - 5, -14, 5, 2.5, 'rgba(255,255,255,0.1)');

        // Second smaller tower
        const towerGrad2 = ctx.createLinearGradient(-w * 0.05 - 5, -15, -w * 0.05 + 5, -8);
        towerGrad2.addColorStop(0, this._lighten(colors.secondary, 0.1));
        towerGrad2.addColorStop(0.5, colors.dark);
        towerGrad2.addColorStop(1, this._darken(colors.dark, 0.15));
        ctx.fillStyle = towerGrad2;
        ctx.fillRect(-w * 0.05 - 5, -15, 10, 7);
        ctx.fillStyle = this._lighten(colors.secondary, 0.05);
        ctx.beginPath();
        ctx.ellipse(-w * 0.05, -15, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colors.secondary;
        ctx.beginPath();
        ctx.ellipse(-w * 0.05, -8, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pipes connecting towers with metallic look
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-w * 0.14, -13);
        ctx.lineTo(-w * 0.08, -12);
        ctx.stroke();
        // Pipe junction rivet
        ctx.fillStyle = '#777';
        ctx.beginPath();
        ctx.arc(-w * 0.11, -12.5, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Spice processing indicator
        const pulse = Math.sin(t / 400) * 0.3 + 0.7;
        ctx.save();
        ctx.shadowColor = '#e08030';
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgba(230,140,50,${pulse})`;
        ctx.beginPath();
        ctx.arc(-w * 0.2, -20, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Status light
        this._blinkLight(ctx, w * 0.13, -16, 1.2, '#00ff44', 900);

        ctx.restore();
    },

    drawSilo(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.42, h * 0.27, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 4, h - 4);

        // Two storage tanks with cylindrical gradient
        for (const ox of [-w * 0.15, w * 0.15]) {
            // Tank body with lighting
            const tankGrad = ctx.createLinearGradient(ox - 8, -18, ox + 8, -2);
            tankGrad.addColorStop(0, this._lighten(colors.dark, 0.15));
            tankGrad.addColorStop(0.3, colors.dark);
            tankGrad.addColorStop(0.7, this._darken(colors.dark, 0.15));
            tankGrad.addColorStop(1, this._darken(colors.dark, 0.3));
            ctx.fillStyle = tankGrad;
            ctx.fillRect(ox - 8, -19, 16, 17);

            // Tank top ellipse with gradient
            const topGrad = ctx.createRadialGradient(ox - 1, -20, 0, ox, -19, 8);
            topGrad.addColorStop(0, this._lighten(colors.primary, 0.25));
            topGrad.addColorStop(0.5, colors.primary);
            topGrad.addColorStop(1, this._darken(colors.primary, 0.1));
            ctx.fillStyle = topGrad;
            ctx.beginPath();
            ctx.ellipse(ox, -19, 8, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tank bottom ring
            ctx.fillStyle = colors.secondary;
            ctx.beginPath();
            ctx.ellipse(ox, -2, 8, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Metal band reinforcements
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ox - 8, -14);
            ctx.lineTo(ox + 8, -14);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ox - 8, -8);
            ctx.lineTo(ox + 8, -8);
            ctx.stroke();

            // Rivets on bands
            this._rivets(ctx, ox - 6, -14, 6, 2.2, 'rgba(255,255,255,0.08)');

            // Spice fill indicator with gradient
            const spiceGrad = ctx.createLinearGradient(0, -10, 0, -4);
            spiceGrad.addColorStop(0, '#f0a838');
            spiceGrad.addColorStop(0.5, '#d08028');
            spiceGrad.addColorStop(1, '#b06020');
            ctx.fillStyle = spiceGrad;
            ctx.fillRect(ox - 6, -10, 12, 6);

            // Spice level glass window
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(ox - 1.5, -16, 3, 12);
            ctx.fillStyle = '#e09030';
            ctx.fillRect(ox - 1, -10, 2, 6);
        }

        // Connecting pipe with metallic finish
        const pipeGrad = ctx.createLinearGradient(-w * 0.07, -11, w * 0.07, -10);
        pipeGrad.addColorStop(0, '#999');
        pipeGrad.addColorStop(0.5, '#bbb');
        pipeGrad.addColorStop(1, '#888');
        ctx.strokeStyle = pipeGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-w * 0.07, -11);
        ctx.lineTo(w * 0.07, -11);
        ctx.stroke();

        // Pipe valve
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(0, -11, 2, 0, Math.PI * 2);
        ctx.fill();

        // Status indicator
        this._blinkLight(ctx, -w * 0.15, -21, 1, '#ffaa00', 1000);

        ctx.restore();
    },

    drawBarracks(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.48, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main building with gradient
        this._isoBox(ctx, 0, -4, w * 0.78, h * 0.68, 12,
            colors.primary, colors.dark, colors.secondary);

        // Wall panel detail
        this._panelLine(ctx, -w * 0.34, -12, -w * 0.34, 2);
        this._panelLine(ctx, w * 0.34, -12, w * 0.34, 2);
        this._panelLine(ctx, -w * 0.34, -6, w * 0.34, -6);
        this._rivets(ctx, -w * 0.32, -14, 5, w * 0.16);

        // Training yard (dirt area in front)
        const yardGrad = ctx.createLinearGradient(-w * 0.34, 2, w * 0.34, h * 0.18);
        yardGrad.addColorStop(0, '#6a5a3a');
        yardGrad.addColorStop(0.5, '#5a4a2a');
        yardGrad.addColorStop(1, '#7a6a4a');
        ctx.fillStyle = yardGrad;
        ctx.fillRect(-w * 0.34, 2, w * 0.68, h * 0.16);
        ctx.strokeStyle = '#8a7a5a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w * 0.34, 2, w * 0.68, h * 0.16);

        // Door with metallic look
        const doorGrad = ctx.createLinearGradient(-w * 0.09, -3, w * 0.09, h * 0.1);
        doorGrad.addColorStop(0, '#444');
        doorGrad.addColorStop(0.5, '#333');
        doorGrad.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = doorGrad;
        ctx.fillRect(-w * 0.09, -3, w * 0.18, h * 0.13);
        // Door handle
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(w * 0.06, -1, 1, 0, Math.PI * 2);
        ctx.fill();

        // Glowing windows
        const winGlow = Math.sin(t / 1400) * 0.12 + 0.5;
        ctx.save();
        ctx.shadowColor = 'rgba(120,180,255,0.3)';
        ctx.shadowBlur = 2.5;
        ctx.fillStyle = `rgba(130,190,255,${winGlow})`;
        ctx.fillRect(-w * 0.32, -11, w * 0.13, h * 0.08);
        ctx.fillRect(w * 0.19, -11, w * 0.13, h * 0.08);
        ctx.restore();
        // Window frames
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w * 0.32, -11, w * 0.13, h * 0.08);
        ctx.strokeRect(w * 0.19, -11, w * 0.13, h * 0.08);

        // Watch tower with gradient
        const towerGrad = ctx.createLinearGradient(w * 0.2, -14, w * 0.2 + 7, -14);
        towerGrad.addColorStop(0, this._lighten(colors.dark, 0.1));
        towerGrad.addColorStop(0.5, colors.dark);
        towerGrad.addColorStop(1, this._darken(colors.dark, 0.2));
        ctx.fillStyle = towerGrad;
        ctx.fillRect(w * 0.2, -14, 7, -14);
        // Tower platform
        ctx.fillStyle = colors.secondary;
        ctx.fillRect(w * 0.17, -28, 13, 4);
        // Platform railing
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(w * 0.17, -30, 13, 2);

        // Flag with wave animation
        const wave = Math.sin(t / 300) * 2;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.22, -28);
        ctx.lineTo(w * 0.22, -36);
        ctx.stroke();
        // Flag fabric
        const flagGrad = ctx.createLinearGradient(w * 0.22, -36, w * 0.32, -32);
        flagGrad.addColorStop(0, colors.primary);
        flagGrad.addColorStop(1, this._lighten(colors.primary, 0.2));
        ctx.fillStyle = flagGrad;
        ctx.beginPath();
        ctx.moveTo(w * 0.22, -36);
        ctx.quadraticCurveTo(w * 0.27, -35 + wave * 0.3, w * 0.32, -34 + wave);
        ctx.quadraticCurveTo(w * 0.27, -33 + wave * 0.5, w * 0.22, -32);
        ctx.closePath();
        ctx.fill();

        // Sandbags with shading
        for (let i = -3; i <= 3; i++) {
            const sbx = i * w * 0.08;
            const sbGrad = ctx.createRadialGradient(sbx - 0.5, h * 0.18, 0, sbx, h * 0.18, 5);
            sbGrad.addColorStop(0, '#a09070');
            sbGrad.addColorStop(0.5, '#8a7a5a');
            sbGrad.addColorStop(1, '#6a5a3a');
            ctx.fillStyle = sbGrad;
            ctx.beginPath();
            ctx.ellipse(sbx, h * 0.19, 4.5, 2.8, 0, 0, Math.PI * 2);
            ctx.fill();
            // Sandbag stitch line
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(sbx - 3, h * 0.19);
            ctx.lineTo(sbx + 3, h * 0.19);
            ctx.stroke();
        }

        // Searchlight
        this._blinkLight(ctx, w * 0.23, -30, 1.5, '#ffffaa', 2000);

        ctx.restore();
    },

    drawLightFactory(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.5, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main factory building
        this._isoBox(ctx, 0, -5, w * 0.82, h * 0.68, 16,
            colors.primary, colors.dark, colors.secondary);

        // Wall panel lines
        this._panelLine(ctx, -w * 0.37, -17, -w * 0.37, 2);
        this._panelLine(ctx, w * 0.37, -17, w * 0.37, 2);
        this._panelLine(ctx, -w * 0.37, -10, w * 0.37, -10);
        this._rivets(ctx, -w * 0.35, -19, 6, w * 0.14);

        // Garage door with metallic gradient
        const doorGrad = ctx.createLinearGradient(-w * 0.22, -3, w * 0.22, h * 0.3);
        doorGrad.addColorStop(0, '#3a3a3a');
        doorGrad.addColorStop(0.3, '#2a2a2a');
        doorGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = doorGrad;
        ctx.fillRect(-w * 0.22, -3, w * 0.44, h * 0.32);
        // Door segments
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
            const dy = -3 + i * (h * 0.064);
            ctx.beginPath();
            ctx.moveTo(-w * 0.22, dy);
            ctx.lineTo(w * 0.22, dy);
            ctx.stroke();
        }
        // Warning stripe
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(-w * 0.22, -4, w * 0.44, 1.5);

        // Saw-tooth roof with gradient
        for (let i = -2; i <= 1; i++) {
            const rx = i * w * 0.16;
            const roofGrad = ctx.createLinearGradient(rx, -19, rx + w * 0.12, -24);
            roofGrad.addColorStop(0, this._darken(colors.secondary, 0.1));
            roofGrad.addColorStop(1, this._lighten(colors.secondary, 0.1));
            ctx.fillStyle = roofGrad;
            ctx.beginPath();
            ctx.moveTo(rx, -19);
            ctx.lineTo(rx + w * 0.16, -19);
            ctx.lineTo(rx + w * 0.13, -24);
            ctx.closePath();
            ctx.fill();
        }

        // Skylights with glow
        ctx.save();
        ctx.shadowColor = 'rgba(200,220,255,0.2)';
        ctx.shadowBlur = 2;
        const skyGlow = Math.sin(t / 2000) * 0.1 + 0.4;
        ctx.fillStyle = `rgba(200,220,255,${skyGlow})`;
        for (let i = -2; i <= 1; i++) {
            ctx.fillRect(i * w * 0.16 + 3, -22, w * 0.08, 2.5);
        }
        ctx.restore();

        // Smokestack with metallic gradient
        const stackGrad = ctx.createLinearGradient(w * 0.25, -19, w * 0.25 + 5, -19);
        stackGrad.addColorStop(0, '#777');
        stackGrad.addColorStop(0.5, '#888');
        stackGrad.addColorStop(1, '#555');
        ctx.fillStyle = stackGrad;
        ctx.fillRect(w * 0.25, -19, 5, -12);
        // Stack cap
        ctx.fillStyle = '#666';
        ctx.fillRect(w * 0.24, -31.5, 7, 2.5);

        // Animated smoke
        const smokePhase = t / 350;
        for (let i = 0; i < 3; i++) {
            const sy = -35 - i * 4 + Math.sin(smokePhase + i * 1.5) * 1.5;
            const sx = w * 0.275 + Math.sin(smokePhase * 0.6 + i * 2) * 2.5;
            const sr = 3.5 + i * 1.5;
            ctx.fillStyle = `rgba(150,145,140,${0.18 - i * 0.04})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Interior welding spark animation
        const sparkOn = Math.sin(t / 200) > 0.7;
        if (sparkOn) {
            ctx.save();
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ffee88';
            const sparkX = -w * 0.05 + Math.sin(t / 100) * w * 0.1;
            ctx.beginPath();
            ctx.arc(sparkX, h * 0.05, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    },

    drawHeavyFactory(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.12, w * 0.5, h * 0.38, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main factory body (tall) with gradient
        this._isoBox(ctx, 0, -8, w * 0.82, h * 0.72, 22,
            colors.primary, colors.dark, colors.secondary);

        // Heavy panel detail
        this._panelLine(ctx, -w * 0.37, -26, -w * 0.37, 2);
        this._panelLine(ctx, w * 0.37, -26, w * 0.37, 2);
        this._panelLine(ctx, -w * 0.37, -18, w * 0.37, -18);
        this._panelLine(ctx, -w * 0.37, -10, w * 0.37, -10);
        this._rivets(ctx, -w * 0.35, -28, 6, w * 0.14);
        this._rivets(ctx, -w * 0.35, -4, 6, w * 0.14);

        // Large vehicle bay door
        const doorGrad = ctx.createLinearGradient(-w * 0.24, -3, w * 0.24, h * 0.26);
        doorGrad.addColorStop(0, '#333');
        doorGrad.addColorStop(0.5, '#222');
        doorGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = doorGrad;
        ctx.fillRect(-w * 0.24, -3, w * 0.48, h * 0.27);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-w * 0.24, -3, w * 0.48, h * 0.27);
        // Rolling door segments
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(-w * 0.24, -3 + i * (h * 0.045));
            ctx.lineTo(w * 0.24, -3 + i * (h * 0.045));
            ctx.stroke();
        }
        // Warning stripes
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(-w * 0.24, -4, w * 0.48, 1.5);
        ctx.fillRect(-w * 0.24, h * 0.22, w * 0.48, 1.5);

        // Overhead crane track
        const trackGrad = ctx.createLinearGradient(-w * 0.37, -28, w * 0.37, -28);
        trackGrad.addColorStop(0, '#999');
        trackGrad.addColorStop(0.5, '#aaa');
        trackGrad.addColorStop(1, '#888');
        ctx.fillStyle = trackGrad;
        ctx.fillRect(-w * 0.37, -28, w * 0.74, 3.5);

        // Animated crane trolley
        const trolleyX = Math.sin(t / 2500) * w * 0.22;
        const trolleyGrad = ctx.createLinearGradient(trolleyX - 6, -31, trolleyX + 6, -28);
        trolleyGrad.addColorStop(0, '#cc9900');
        trolleyGrad.addColorStop(0.5, '#ddaa22');
        trolleyGrad.addColorStop(1, '#aa8800');
        ctx.fillStyle = trolleyGrad;
        ctx.fillRect(trolleyX - 6, -31, 12, 3);
        // Trolley wheels
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(trolleyX - 4, -28, 1.5, 0, Math.PI * 2);
        ctx.arc(trolleyX + 4, -28, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // Cable with sway
        const cableSway = Math.sin(t / 400) * 1;
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(trolleyX, -28);
        ctx.quadraticCurveTo(trolleyX + cableSway, -23, trolleyX, -19);
        ctx.stroke();
        // Hook
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.arc(trolleyX, -18.5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Two smokestacks with gradient
        for (const sx of [-w * 0.32, w * 0.27]) {
            const sGrad = ctx.createLinearGradient(sx, -28, sx + 6, -28);
            sGrad.addColorStop(0, '#777');
            sGrad.addColorStop(0.5, '#888');
            sGrad.addColorStop(1, '#555');
            ctx.fillStyle = sGrad;
            ctx.fillRect(sx, -28, 6, -16);
            // Stack cap
            ctx.fillStyle = '#666';
            ctx.fillRect(sx - 1.5, -44.5, 9, 3);
            // Band detail
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, -36);
            ctx.lineTo(sx + 6, -36);
            ctx.stroke();
        }

        // Heavy animated smoke
        const sk = t / 400;
        for (let i = 0; i < 3; i++) {
            for (const sx of [-w * 0.29, w * 0.30]) {
                const smokeY = -47 - i * 4 + Math.sin(sk + i * 2) * 1.5;
                const smokeX = sx + Math.sin(sk * 0.5 + i) * 2;
                const smokeR = 4 + i * 1.5;
                ctx.fillStyle = `rgba(130,125,120,${0.18 - i * 0.04})`;
                ctx.beginPath();
                ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Interior glow
        const interiorGlow = Math.sin(t / 600) * 0.1 + 0.15;
        ctx.fillStyle = `rgba(255,160,40,${interiorGlow})`;
        ctx.fillRect(-w * 0.22, -1, w * 0.44, h * 0.2);

        ctx.restore();
    },

    drawMGTurret(ctx, x, y, w, h, colors, turretAngle) {
        ctx.save();
        ctx.translate(x, y);

        this._shadow(ctx, 0, 3, 12, 6, 0.2);

        // Small concrete base
        const baseGrad = ctx.createRadialGradient(-1, 0, 0, 0, 1, 11);
        baseGrad.addColorStop(0, '#999');
        baseGrad.addColorStop(0.5, '#777');
        baseGrad.addColorStop(1, '#555');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.ellipse(0, 1, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Base rim
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.ellipse(0, 2, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Small turret housing
        const tGrad = ctx.createRadialGradient(-1, -3, 0, 0, -2, 7);
        tGrad.addColorStop(0, this._lighten(colors.primary, 0.3));
        tGrad.addColorStop(0.5, colors.primary);
        tGrad.addColorStop(1, this._darken(colors.primary, 0.15));
        ctx.fillStyle = tGrad;
        ctx.beginPath();
        ctx.ellipse(0, -2, 7, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret top
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.beginPath();
        ctx.ellipse(0, -3.5, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this._lighten(colors.primary, 0.2);
        ctx.beginPath();
        ctx.ellipse(0, -4.5, 5.5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Twin MG barrels
        const angle = turretAngle || 0;
        for (const offset of [-2, 2]) {
            const ox = Math.cos(angle) * offset;
            const oy = Math.sin(angle) * offset * 0.5;
            const bLen = 13;
            const bx = Math.sin(angle) * bLen + ox;
            const by = -Math.cos(angle) * bLen * 0.5 - 4.5 + oy;

            // Barrel
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ox, -4.5 + oy);
            ctx.lineTo(bx, by);
            ctx.stroke();

            // Muzzle
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(bx, by, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ammo belt detail
        ctx.fillStyle = '#aa8833';
        ctx.fillRect(-3, -2, 6, 1.5);

        // Status light (fast blink for rapid fire)
        this._blinkLight(ctx, 0, -5, 0.8, '#ffaa00', 400);

        ctx.restore();
    },

    drawTurret(ctx, x, y, w, h, colors, turretAngle) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, 4, 14, 7, 0.25);

        // Concrete base with gradient
        const baseGrad = ctx.createRadialGradient(-2, -1, 0, 0, 1, 14);
        baseGrad.addColorStop(0, '#999');
        baseGrad.addColorStop(0.5, '#777');
        baseGrad.addColorStop(1, '#555');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.ellipse(0, 1, 14, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Base rim
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.ellipse(0, 3, 14, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Upper base
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret housing with gradient
        const tGrad = ctx.createRadialGradient(-2, -5, 0, 0, -4, 10);
        tGrad.addColorStop(0, this._lighten(colors.primary, 0.25));
        tGrad.addColorStop(0.5, colors.primary);
        tGrad.addColorStop(1, this._darken(colors.primary, 0.2));
        ctx.fillStyle = tGrad;
        ctx.beginPath();
        ctx.ellipse(0, -3, 10, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret ring
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.beginPath();
        ctx.ellipse(0, -5, 9, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Turret top
        const topGrad = ctx.createRadialGradient(-2, -7, 0, 0, -6, 8);
        topGrad.addColorStop(0, this._lighten(colors.primary, 0.3));
        topGrad.addColorStop(0.5, colors.primary);
        topGrad.addColorStop(1, this._darken(colors.primary, 0.15));
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.ellipse(0, -6.5, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rivets on turret
        this._rivets(ctx, -5, -4, 5, 2.5);

        // Gun barrel — uses pre-calculated turretAngle
        const angle = turretAngle || 0;
        const bLen = 16;
        const bx = Math.sin(angle) * bLen;
        const by = -Math.cos(angle) * bLen * 0.5 - 6.5;
        this._barrel(ctx, 0, -6.5, bx, by, 3.5);

        // Muzzle with dark bore
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Status light
        this._blinkLight(ctx, 0, -7, 1, '#ff0000', 800);

        ctx.restore();
    },

    drawRocketTurret(ctx, x, y, w, h, colors, turretAngle) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, 4, 15, 7, 0.25);

        // Fortified base with gradient
        const baseGrad = ctx.createRadialGradient(-2, -1, 0, 0, 1, 15);
        baseGrad.addColorStop(0, '#999');
        baseGrad.addColorStop(0.5, '#777');
        baseGrad.addColorStop(1, '#555');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.ellipse(0, 1, 15, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.ellipse(0, 3, 15, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Armored housing
        const hGrad = ctx.createRadialGradient(-2, -6, 0, 0, -4, 11);
        hGrad.addColorStop(0, this._lighten(colors.primary, 0.25));
        hGrad.addColorStop(0.5, colors.primary);
        hGrad.addColorStop(1, this._darken(colors.primary, 0.2));
        ctx.fillStyle = hGrad;
        ctx.beginPath();
        ctx.ellipse(0, -4, 11, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Side armor band
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.fillRect(-9, -5, 18, 5);

        // Turret top
        const topGrad = ctx.createRadialGradient(-2, -8.5, 0, 0, -7, 10);
        topGrad.addColorStop(0, this._lighten(colors.primary, 0.3));
        topGrad.addColorStop(0.5, colors.primary);
        topGrad.addColorStop(1, this._darken(colors.primary, 0.15));
        ctx.fillStyle = topGrad;
        ctx.beginPath();
        ctx.ellipse(0, -7.5, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rivets
        this._rivets(ctx, -7, -5, 7, 2.2);

        // Dual rocket launcher pods — uses pre-calculated turretAngle
        const angle = turretAngle || 0;
        for (const offset of [-3.5, 3.5]) {
            const ox = Math.cos(angle) * offset;
            const oy = Math.sin(angle) * offset * 0.5;
            const bLen = 14;
            const bx = Math.sin(angle) * bLen + ox;
            const by = -Math.cos(angle) * bLen * 0.5 - 7.5 + oy;

            // Launch tube
            this._barrel(ctx, ox, -7.5 + oy, bx, by, 3.2);

            // Rocket tip with glow
            ctx.save();
            ctx.shadowColor = '#ff3300';
            ctx.shadowBlur = 4;
            const tipGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 2.5);
            tipGrad.addColorStop(0, '#ff5533');
            tipGrad.addColorStop(0.5, '#cc3322');
            tipGrad.addColorStop(1, '#991111');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Status lights
        this._blinkLight(ctx, -4, -8, 1, '#ff0000', 600);
        this._blinkLight(ctx, 4, -8, 1, '#ff0000', 900);

        ctx.restore();
    },

    drawRadar(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.43, h * 0.28, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 4, h - 4);

        // Building base
        this._isoBox(ctx, 0, -3, w * 0.62, h * 0.52, 10,
            colors.primary, colors.dark, colors.secondary);

        // Panel detail
        this._panelLine(ctx, -w * 0.27, -10, -w * 0.27, 2);
        this._panelLine(ctx, w * 0.27, -10, w * 0.27, 2);
        this._rivets(ctx, -w * 0.25, -12, 4, w * 0.16);

        // Equipment panels with blinking lights
        const panelGrad = ctx.createLinearGradient(-w * 0.2, -9, -w * 0.05, -4);
        panelGrad.addColorStop(0, '#3a3a3a');
        panelGrad.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = panelGrad;
        ctx.fillRect(-w * 0.22, -9, w * 0.17, h * 0.13);
        ctx.fillRect(w * 0.05, -9, w * 0.17, h * 0.13);
        // Panel screen glow
        ctx.save();
        ctx.shadowColor = 'rgba(0,255,100,0.2)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = 'rgba(0,180,80,0.3)';
        ctx.fillRect(-w * 0.2, -8, w * 0.13, h * 0.08);
        ctx.fillStyle = 'rgba(0,120,200,0.3)';
        ctx.fillRect(w * 0.07, -8, w * 0.13, h * 0.08);
        ctx.restore();

        // Blinking LEDs
        this._blinkLight(ctx, -w * 0.18, -5, 1, '#00ff44', 400);
        this._blinkLight(ctx, -w * 0.13, -5, 1, '#ffaa00', 600);
        this._blinkLight(ctx, w * 0.09, -5, 1, '#ff2200', 500);
        this._blinkLight(ctx, w * 0.14, -5, 1, '#00ccff', 800);

        // Radar tower mast with metallic gradient
        const mastGrad = ctx.createLinearGradient(-2.5, -12, 2.5, -12);
        mastGrad.addColorStop(0, '#999');
        mastGrad.addColorStop(0.4, '#bbb');
        mastGrad.addColorStop(0.6, '#aaa');
        mastGrad.addColorStop(1, '#777');
        ctx.fillStyle = mastGrad;
        ctx.fillRect(-2.5, -12, 5, -30);

        // Tower braces with metallic look
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-9, -12);
        ctx.lineTo(-2.5, -32);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(9, -12);
        ctx.lineTo(2.5, -32);
        ctx.stroke();
        // Cross braces
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-6, -18);
        ctx.lineTo(6, -26);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(6, -18);
        ctx.lineTo(-6, -26);
        ctx.stroke();

        // Platform at top
        ctx.fillStyle = '#888';
        ctx.fillRect(-5, -42, 10, 2);

        // Rotating dish
        const dishAngle = t / 1200;
        ctx.save();
        ctx.translate(0, -44);
        const dishW = Math.cos(dishAngle) * 18;

        // Dish with gradient
        const absW = Math.abs(dishW) + 2;
        const dishGrad = ctx.createLinearGradient(-absW, -8, absW, 8);
        dishGrad.addColorStop(0, '#ddd');
        dishGrad.addColorStop(0.3, '#ccc');
        dishGrad.addColorStop(0.7, '#aaa');
        dishGrad.addColorStop(1, '#888');
        ctx.fillStyle = dishGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, absW, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner dish
        const innerGrad = ctx.createRadialGradient(dishW > 0 ? -2 : 2, 0, 0, 0, 0, Math.abs(dishW) + 1);
        innerGrad.addColorStop(0, '#bbb');
        innerGrad.addColorStop(0.5, '#999');
        innerGrad.addColorStop(1, '#777');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.ellipse(dishW > 0 ? -1 : 1, 0, Math.abs(dishW), 7.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Feed horn
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Feed horn glow
        this._blinkLight(ctx, 0, 0, 1.2, '#00ff88', 300);

        ctx.restore();

        // Radar sweep indicator light at base
        this._blinkLight(ctx, 0, -10, 1.5, '#00ccff', 600);

        ctx.restore();
    },

    drawWall(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-w * 0.38, h * 0.12, w * 0.82, h * 0.14);

        // Wall block with gradient
        const wallTopGrad = ctx.createLinearGradient(-w * 0.4, -10, w * 0.4, 0);
        wallTopGrad.addColorStop(0, '#bbb');
        wallTopGrad.addColorStop(0.3, '#aaa');
        wallTopGrad.addColorStop(0.7, '#999');
        wallTopGrad.addColorStop(1, '#888');

        const wallSideGrad = ctx.createLinearGradient(0, -8, 0, 4);
        wallSideGrad.addColorStop(0, '#888');
        wallSideGrad.addColorStop(1, '#666');

        const wallFrontGrad = ctx.createLinearGradient(-w * 0.4, 0, w * 0.4, 8);
        wallFrontGrad.addColorStop(0, '#999');
        wallFrontGrad.addColorStop(0.5, '#888');
        wallFrontGrad.addColorStop(1, '#777');

        // Custom iso box with gradients
        const hw = w * 0.85 / 2, hh = h * 0.85 / 2;
        const depth = 9;
        const cy = -2;

        // Right side
        ctx.fillStyle = wallSideGrad;
        ctx.beginPath();
        ctx.moveTo(hw, cy - hh);
        ctx.lineTo(hw, cy - hh + depth);
        ctx.lineTo(hw, cy + hh + depth);
        ctx.lineTo(hw, cy + hh);
        ctx.closePath();
        ctx.fill();

        // Front
        ctx.fillStyle = wallFrontGrad;
        ctx.beginPath();
        ctx.moveTo(-hw, cy + hh);
        ctx.lineTo(hw, cy + hh);
        ctx.lineTo(hw, cy + hh + depth);
        ctx.lineTo(-hw, cy + hh + depth);
        ctx.closePath();
        ctx.fill();

        // Top
        ctx.fillStyle = wallTopGrad;
        ctx.fillRect(-hw, cy - hh, w * 0.85, h * 0.85);

        // Mortar lines with depth
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.7;
        // Horizontal mortar
        ctx.beginPath();
        ctx.moveTo(-hw + 1, -5);
        ctx.lineTo(hw - 1, -5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hw + 1, 0);
        ctx.lineTo(hw - 1, 0);
        ctx.stroke();
        // Vertical mortar (offset per row for brick pattern)
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(0, -5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hw * 0.5, -5);
        ctx.lineTo(-hw * 0.5, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hw * 0.5, -5);
        ctx.lineTo(hw * 0.5, 0);
        ctx.stroke();

        // Mortar line highlights
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(-hw + 1, -4.5);
        ctx.lineTo(hw - 1, -4.5);
        ctx.stroke();

        // Top battlements with gradient
        const batGrad = ctx.createLinearGradient(0, -12, 0, -9);
        batGrad.addColorStop(0, '#ccc');
        batGrad.addColorStop(1, '#aaa');
        ctx.fillStyle = batGrad;
        ctx.fillRect(-hw, -12, w * 0.22, 3.5);
        ctx.fillRect(hw - w * 0.22, -12, w * 0.22, 3.5);

        // Edge highlight (top-left light)
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-hw, cy + hh);
        ctx.lineTo(-hw, cy - hh);
        ctx.lineTo(hw, cy - hh);
        ctx.stroke();

        ctx.restore();
    },

    drawRepairBay(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.48, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Hazard stripes on pad edges
        const stripeW = w * 0.42;
        const stripeH = h * 0.38;
        ctx.save();
        ctx.beginPath();
        ctx.rect(-stripeW, -stripeH, stripeW * 2, stripeH * 2);
        ctx.clip();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2.5;
        for (let i = -12; i < 20; i++) {
            const sx = -stripeW + i * 6;
            ctx.beginPath();
            ctx.moveTo(sx, -stripeH);
            ctx.lineTo(sx + stripeH * 2, stripeH);
            ctx.strokeStyle = i % 2 === 0 ? '#ccaa00' : '#222';
            ctx.stroke();
        }
        ctx.restore();

        // Main building structure
        this._isoBox(ctx, 0, -4, w * 0.78, h * 0.68, 12,
            colors.primary, colors.dark, colors.secondary);

        // Wall panel details
        this._panelLine(ctx, -w * 0.34, -12, -w * 0.34, 2);
        this._panelLine(ctx, w * 0.34, -12, w * 0.34, 2);
        this._panelLine(ctx, -w * 0.34, -6, w * 0.34, -6);
        this._rivets(ctx, -w * 0.32, -14, 5, w * 0.16);

        // Vehicle lift platform (center, sunken look)
        const liftGrad = ctx.createLinearGradient(-w * 0.25, -2, w * 0.25, h * 0.12);
        liftGrad.addColorStop(0, '#555');
        liftGrad.addColorStop(0.5, '#444');
        liftGrad.addColorStop(1, '#333');
        ctx.fillStyle = liftGrad;
        ctx.fillRect(-w * 0.25, -2, w * 0.5, h * 0.14);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-w * 0.25, -2, w * 0.5, h * 0.14);

        // Hydraulic lift lines on platform
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) {
            const lx = -w * 0.2 + i * w * 0.13;
            ctx.beginPath();
            ctx.moveTo(lx, -1);
            ctx.lineTo(lx, h * 0.11);
            ctx.stroke();
        }

        // Mechanical arm / crane (left side)
        const armGrad = ctx.createLinearGradient(-w * 0.36, -18, -w * 0.36 + 4, -18);
        armGrad.addColorStop(0, '#888');
        armGrad.addColorStop(0.5, '#999');
        armGrad.addColorStop(1, '#666');
        ctx.fillStyle = armGrad;
        ctx.fillRect(-w * 0.36, -14, 4, -16);
        // Arm horizontal piece
        ctx.fillStyle = '#777';
        ctx.fillRect(-w * 0.36, -30, w * 0.35, 3);
        // Arm hook/claw
        const hookSwing = Math.sin(t / 1500) * 2;
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w * 0.05, -28);
        ctx.lineTo(-w * 0.05 + hookSwing, -22);
        ctx.stroke();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-w * 0.05 + hookSwing, -21, 2, 0, Math.PI);
        ctx.stroke();

        // Wrench icon on the roof
        ctx.save();
        ctx.translate(w * 0.12, -12);
        ctx.rotate(Math.PI * 0.25);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(-1, -5, 2, 10);
        // Wrench head
        ctx.beginPath();
        ctx.arc(0, -5, 3, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 5, 3, 0, Math.PI);
        ctx.fill();
        ctx.restore();

        // Tool rack on right wall
        ctx.fillStyle = '#555';
        ctx.fillRect(w * 0.25, -12, w * 0.08, h * 0.16);
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 0.5;
        // Small tool silhouettes
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(w * 0.27, -10 + i * 3);
            ctx.lineTo(w * 0.31, -10 + i * 3);
            ctx.stroke();
        }

        // Warning light (blinking yellow)
        this._blinkLight(ctx, -w * 0.34, -16, 2, '#ffcc00', 1200);

        // Welding sparks when active (animated)
        const sparkOn = Math.sin(t / 180) > 0.6;
        if (sparkOn) {
            ctx.save();
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#ffdd44';
            const sparkX = -w * 0.03 + Math.sin(t / 90) * w * 0.08;
            ctx.beginPath();
            ctx.arc(sparkX, h * 0.02, 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    },

    drawHospital(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();

        this._shadow(ctx, 0, h * 0.15, w * 0.48, h * 0.32, 0.2);

        // Concrete pad
        this._concretePad(ctx, 0, 0, w - 2, h - 2);

        // Main building - white/light walls with house color accents
        this._isoBox(ctx, 0, -4, w * 0.78, h * 0.68, 12,
            '#ddd', '#bbb', '#ccc');

        // House color accent stripe along top of walls
        ctx.fillStyle = colors.primary;
        ctx.fillRect(-w * 0.39, -16, w * 0.78, 3);

        // House color accent stripe along bottom
        ctx.fillStyle = colors.secondary;
        ctx.fillRect(-w * 0.39, h * 0.08, w * 0.78, 2);

        // Wall panel detail
        this._panelLine(ctx, -w * 0.34, -12, -w * 0.34, 2);
        this._panelLine(ctx, w * 0.34, -12, w * 0.34, 2);
        this._panelLine(ctx, -w * 0.34, -4, w * 0.34, -4);
        this._rivets(ctx, -w * 0.32, -14, 5, w * 0.16);

        // Red cross on the roof (centered)
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-5, -12, 10, 3);
        ctx.fillRect(-1.5, -15.5, 3, 10);
        // Cross outline glow
        ctx.save();
        ctx.shadowColor = 'rgba(255, 50, 50, 0.4)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ee3333';
        ctx.fillRect(-4, -11.5, 8, 2);
        ctx.fillRect(-1, -14.5, 2, 8);
        ctx.restore();

        // Door (white/clean)
        const doorGrad = ctx.createLinearGradient(-w * 0.08, -2, w * 0.08, h * 0.1);
        doorGrad.addColorStop(0, '#eee');
        doorGrad.addColorStop(0.5, '#ddd');
        doorGrad.addColorStop(1, '#ccc');
        ctx.fillStyle = doorGrad;
        ctx.fillRect(-w * 0.08, -2, w * 0.16, h * 0.12);
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w * 0.08, -2, w * 0.16, h * 0.12);
        // Small red cross on door
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-2, 0, 4, 1);
        ctx.fillRect(-0.5, -1.5, 1, 4);

        // Windows with soft glow (clean medical lighting)
        const winGlow = Math.sin(t / 1800) * 0.1 + 0.55;
        ctx.save();
        ctx.shadowColor = 'rgba(200, 255, 220, 0.3)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = `rgba(220, 255, 230, ${winGlow})`;
        ctx.fillRect(-w * 0.32, -9, w * 0.12, h * 0.08);
        ctx.fillRect(w * 0.20, -9, w * 0.12, h * 0.08);
        ctx.restore();
        // Window frames
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-w * 0.32, -9, w * 0.12, h * 0.08);
        ctx.strokeRect(w * 0.20, -9, w * 0.12, h * 0.08);
        // Window cross bars
        ctx.beginPath();
        ctx.moveTo(-w * 0.26, -9);
        ctx.lineTo(-w * 0.26, -9 + h * 0.08);
        ctx.moveTo(-w * 0.32, -9 + h * 0.04);
        ctx.lineTo(-w * 0.20, -9 + h * 0.04);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.26, -9);
        ctx.lineTo(w * 0.26, -9 + h * 0.08);
        ctx.moveTo(w * 0.20, -9 + h * 0.04);
        ctx.lineTo(w * 0.32, -9 + h * 0.04);
        ctx.stroke();

        // Medical equipment detail (small monitor on right side)
        ctx.fillStyle = '#444';
        ctx.fillRect(w * 0.24, -3, w * 0.08, h * 0.06);
        // Screen with pulse line
        ctx.fillStyle = '#113311';
        ctx.fillRect(w * 0.25, -2.5, w * 0.06, h * 0.04);
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 0.6;
        const pulse = t / 300;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const px = w * 0.255 + i * w * 0.012;
            const py = -1.5 + Math.sin(pulse + i * 1.5) * 1.5;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Red light on top (blinking slowly)
        this._blinkLight(ctx, 0, -17, 2, '#ff3333', 2500);

        // Small antenna/mast
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.28, -16);
        ctx.lineTo(w * 0.28, -22);
        ctx.stroke();
        this._blinkLight(ctx, w * 0.28, -22, 1.2, '#ff6666', 1800);

        ctx.restore();
    },

    // ---- HELPER DRAWING FUNCTIONS ----

    _isoBox(ctx, cx, cy, w, h, depth, topColor, sideColor, frontColor) {
        const hw = w / 2;
        const hh = h / 2;

        // Right side with gradient
        const sideGrad = ctx.createLinearGradient(cx + hw, cy - hh, cx + hw, cy + hh + depth);
        if (typeof sideColor === 'string' && sideColor.startsWith('#')) {
            sideGrad.addColorStop(0, this._lighten(sideColor, 0.05));
            sideGrad.addColorStop(0.5, sideColor);
            sideGrad.addColorStop(1, this._darken(sideColor, 0.15));
        } else {
            sideGrad.addColorStop(0, sideColor);
            sideGrad.addColorStop(1, sideColor);
        }
        ctx.fillStyle = sideGrad;
        ctx.beginPath();
        ctx.moveTo(cx + hw, cy - hh);
        ctx.lineTo(cx + hw, cy - hh + depth);
        ctx.lineTo(cx + hw, cy + hh + depth);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.closePath();
        ctx.fill();

        // Front side with gradient
        const frontGrad = ctx.createLinearGradient(cx - hw, cy + hh, cx + hw, cy + hh + depth);
        if (typeof frontColor === 'string' && frontColor.startsWith('#')) {
            frontGrad.addColorStop(0, this._lighten(frontColor, 0.05));
            frontGrad.addColorStop(0.5, frontColor);
            frontGrad.addColorStop(1, this._darken(frontColor, 0.1));
        } else {
            frontGrad.addColorStop(0, frontColor);
            frontGrad.addColorStop(1, frontColor);
        }
        ctx.fillStyle = frontGrad;
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy + hh);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.lineTo(cx + hw, cy + hh + depth);
        ctx.lineTo(cx - hw, cy + hh + depth);
        ctx.closePath();
        ctx.fill();

        // Top face with lighting gradient (top-left light source)
        const topGrad = ctx.createLinearGradient(cx - hw, cy - hh, cx + hw, cy + hh);
        if (typeof topColor === 'string' && topColor.startsWith('#')) {
            topGrad.addColorStop(0, this._lighten(topColor, 0.15));
            topGrad.addColorStop(0.5, topColor);
            topGrad.addColorStop(1, this._darken(topColor, 0.1));
        } else {
            topGrad.addColorStop(0, topColor);
            topGrad.addColorStop(1, topColor);
        }
        ctx.fillStyle = topGrad;
        ctx.fillRect(cx - hw, cy - hh, w, h);

        // Edge highlight (top-left light)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - hw, cy + hh);
        ctx.lineTo(cx - hw, cy - hh);
        ctx.lineTo(cx + hw, cy - hh);
        ctx.stroke();

        // Edge shadow (bottom-right)
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(cx + hw, cy - hh);
        ctx.lineTo(cx + hw, cy + hh);
        ctx.lineTo(cx - hw, cy + hh);
        ctx.stroke();
    },

    _isoTrack(ctx, x, y, w, h) {
        // Track outer shell with gradient
        const trackGrad = ctx.createLinearGradient(x, y, x + w, y);
        trackGrad.addColorStop(0, '#333');
        trackGrad.addColorStop(0.3, '#2a2a2a');
        trackGrad.addColorStop(0.7, '#222');
        trackGrad.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = trackGrad;
        this._roundRect(ctx, x, y, w, h, 2.5);
        ctx.fill();

        // Animated track links
        const trackOffset = (Date.now() / 100) % 4;
        ctx.fillStyle = '#3a3a3a';
        for (let i = 0; i < h; i += 4) {
            const ly = y + ((i + trackOffset) % h);
            if (ly < y + h - 1) {
                ctx.fillRect(x + 0.5, ly, w - 1, 1.5);
            }
        }

        // Track guide teeth (center ridge)
        ctx.fillStyle = '#2e2e2e';
        ctx.fillRect(x + w * 0.35, y + 1, w * 0.3, h - 2);

        // Subtle highlight on top edge
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, y, w, 2);

        // Track wheel hubs visible through links
        ctx.fillStyle = '#444';
        const wheelSpacing = h / 4;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + i * wheelSpacing, w * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }

        // Edge shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        this._roundRect(ctx, x, y, w, h, 2.5);
        ctx.stroke();
    },

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },

    drawHelipad(ctx, x, y, w, h, colors) {
        ctx.save();
        ctx.translate(x, y);
        const t = Date.now();
        const hw = w / 2, hh = h / 2;

        // Base platform - concrete pad
        const baseGrad = ctx.createLinearGradient(-hw, -hh, hw, hh);
        baseGrad.addColorStop(0, '#666');
        baseGrad.addColorStop(0.5, '#777');
        baseGrad.addColorStop(1, '#5a5a5a');
        ctx.fillStyle = baseGrad;
        this._roundedRect(ctx, -hw, -hh, w, h, 3);
        ctx.fill();

        // Concrete texture lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0);
        ctx.moveTo(0, -hh); ctx.lineTo(0, hh);
        ctx.stroke();

        // Landing circle
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(hw, hh) * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // H marking
        ctx.fillStyle = colors.primary;
        ctx.font = `bold ${Math.floor(h * 0.35)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', 0, 1);

        // Corner markings
        const cm = 4;
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 1.5;
        // Top-left
        ctx.beginPath(); ctx.moveTo(-hw + 2, -hh + cm + 2); ctx.lineTo(-hw + 2, -hh + 2); ctx.lineTo(-hw + cm + 2, -hh + 2); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(hw - cm - 2, -hh + 2); ctx.lineTo(hw - 2, -hh + 2); ctx.lineTo(hw - 2, -hh + cm + 2); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(-hw + 2, hh - cm - 2); ctx.lineTo(-hw + 2, hh - 2); ctx.lineTo(-hw + cm + 2, hh - 2); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(hw - cm - 2, hh - 2); ctx.lineTo(hw - 2, hh - 2); ctx.lineTo(hw - 2, hh - cm - 2); ctx.stroke();

        // Warning stripes on edges
        ctx.fillStyle = '#cc8800';
        ctx.fillRect(-hw, -hh, w, 2);
        ctx.fillRect(-hw, hh - 2, w, 2);
        ctx.fillStyle = '#222';
        for (let i = -hw; i < hw; i += 6) {
            ctx.fillRect(i, -hh, 3, 2);
            ctx.fillRect(i + 3, hh - 2, 3, 2);
        }

        // Fuel/ammo depot on side
        ctx.fillStyle = this._darken(colors.dark, 0.1);
        ctx.fillRect(hw - 10, -hh + 4, 8, 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(hw - 10, -hh + 4, 8, 6);
        // Ammo crate
        ctx.fillStyle = '#554422';
        ctx.fillRect(hw - 9, -hh + 5, 3, 4);
        ctx.fillStyle = '#443311';
        ctx.fillRect(hw - 5, -hh + 5, 3, 4);

        // Blinking light
        if (Math.sin(t / 500) > 0) {
            ctx.fillStyle = '#00ff44';
            ctx.beginPath();
            ctx.arc(-hw + 5, -hh + 5, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // House color border
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 1.5;
        this._roundedRect(ctx, -hw, -hh, w, h, 3);
        ctx.stroke();

        ctx.restore();
    },

    drawOrnithopter(ctx, x, y, dir, colors, landed) {
        ctx.save();
        ctx.translate(x, y);

        const t = Date.now();
        const wingFlap = landed ? 0 : Math.sin(t / 80) * 0.35;
        const bodyBob = landed ? 0 : Math.sin(t / 400) * 1;

        // Shadow on ground (below the aircraft)
        if (!landed) {
            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(0, 8 + (this.flyHeight || 8), 10, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.rotate(dir);
        ctx.translate(0, bodyBob);

        // Fuselage body
        const bodyGrad = ctx.createLinearGradient(-3, 0, 3, 0);
        bodyGrad.addColorStop(0, this._darken(colors.primary, 0.2));
        bodyGrad.addColorStop(0.5, colors.primary);
        bodyGrad.addColorStop(1, this._darken(colors.primary, 0.15));
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(0, -10); // nose
        ctx.lineTo(3.5, -4);
        ctx.lineTo(3.5, 6);
        ctx.lineTo(2, 9); // tail
        ctx.lineTo(-2, 9);
        ctx.lineTo(-3.5, 6);
        ctx.lineTo(-3.5, -4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this._darken(colors.dark, 0.1);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Cockpit canopy
        const canopyGrad = ctx.createLinearGradient(-2, -8, 2, -5);
        canopyGrad.addColorStop(0, 'rgba(120,180,255,0.8)');
        canopyGrad.addColorStop(0.5, 'rgba(80,140,220,0.6)');
        canopyGrad.addColorStop(1, 'rgba(60,100,180,0.4)');
        ctx.fillStyle = canopyGrad;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(2, -5);
        ctx.lineTo(-2, -5);
        ctx.closePath();
        ctx.fill();
        // Canopy glint
        ctx.fillStyle = 'rgba(200,230,255,0.4)';
        ctx.beginPath();
        ctx.moveTo(-0.5, -8);
        ctx.lineTo(0.5, -7);
        ctx.lineTo(-1, -6);
        ctx.closePath();
        ctx.fill();

        // Left wing
        ctx.save();
        ctx.translate(-3.5, -1);
        ctx.rotate(-wingFlap);
        const lwGrad = ctx.createLinearGradient(0, 0, -11, 0);
        lwGrad.addColorStop(0, colors.primary);
        lwGrad.addColorStop(0.7, this._darken(colors.primary, 0.15));
        lwGrad.addColorStop(1, this._darken(colors.dark, 0.1));
        ctx.fillStyle = lwGrad;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(-11, -1);
        ctx.lineTo(-10, 2);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this._darken(colors.dark, 0.1);
        ctx.lineWidth = 0.4;
        ctx.stroke();
        // Wing weapon hardpoint
        ctx.fillStyle = '#333';
        ctx.fillRect(-7, 0, 2, 1.5);
        ctx.restore();

        // Right wing
        ctx.save();
        ctx.translate(3.5, -1);
        ctx.rotate(wingFlap);
        const rwGrad = ctx.createLinearGradient(0, 0, 11, 0);
        rwGrad.addColorStop(0, colors.primary);
        rwGrad.addColorStop(0.7, this._darken(colors.primary, 0.15));
        rwGrad.addColorStop(1, this._darken(colors.dark, 0.1));
        ctx.fillStyle = rwGrad;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(11, -1);
        ctx.lineTo(10, 2);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this._darken(colors.dark, 0.1);
        ctx.lineWidth = 0.4;
        ctx.stroke();
        // Wing weapon hardpoint
        ctx.fillStyle = '#333';
        ctx.fillRect(5, 0, 2, 1.5);
        ctx.restore();

        // Tail fins
        ctx.fillStyle = colors.secondary;
        // Left tail fin
        ctx.beginPath();
        ctx.moveTo(-2, 7);
        ctx.lineTo(-5, 10);
        ctx.lineTo(-1, 9);
        ctx.closePath();
        ctx.fill();
        // Right tail fin
        ctx.beginPath();
        ctx.moveTo(2, 7);
        ctx.lineTo(5, 10);
        ctx.lineTo(1, 9);
        ctx.closePath();
        ctx.fill();

        // Engine glow on back
        if (!landed) {
            const engineGlow = Math.sin(t / 100) * 0.2 + 0.7;
            ctx.fillStyle = `rgba(100,180,255,${engineGlow * 0.5})`;
            ctx.beginPath();
            ctx.ellipse(0, 9, 2, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Nose gun
        ctx.fillStyle = '#333';
        ctx.fillRect(-0.8, -11.5, 1.6, 2);

        // Panel lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(-2, -3); ctx.lineTo(2, -3);
        ctx.moveTo(-2, 2); ctx.lineTo(2, 2);
        ctx.stroke();

        // House insignia dot
        ctx.fillStyle = colors.secondary;
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.restore();
    },

    _roundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
};
