// ============================================================
// MODULE: 08-fx.js
// Назначение: spawnProjectile, spawnParticles, spawnExplosion
// Оригинальные строки IIFE: 2471-2510
// Порядок загрузки: 9/24
// ============================================================

        function spawnProjectile(x, y, angle, faction, damage, isPlanetTarget, isBig) {
            const projectile = projectilePool.get();
            projectile.x = x;
            projectile.y = y;
            projectile.vx = Math.cos(angle) * (isBig ? 5 : 6);
            projectile.vy = Math.sin(angle) * (isBig ? 5 : 6);
            projectile.faction = faction;
            projectile.damage = damage;
            projectile.life = isBig ? 90 : 70;
            projectile.active = true;
            projectile.isPlanetTarget = isPlanetTarget;
            projectile.isBig = isBig;
            G.projectiles.push(projectile);
            return projectile;
        }

        function spawnParticles(x, y, color, count) {
            for (let i = 0; i < Math.min(count, 10); i++) {
                const particle = particlePool.get();
                const angle = Math.random() * Math.PI * 2;
                const spd = 0.5 + Math.random() * 2;

                particle.x = x;
                particle.y = y;
                particle.vx = Math.cos(angle) * spd;
                particle.vy = Math.sin(angle) * spd;
                particle.life = 20 + Math.random() * 15;
                particle.maxLife = 35;
                particle.color = color;
                particle.size = 1 + Math.random() * 2;
                particle.active = true;
                G.particles.push(particle);
            }
        }

        function spawnExplosion(x, y, color, size) {
            G.explosions.push({ x, y, radius: 5, maxRadius: Math.min(size, 30), color, life: 1 });
            spawnParticles(x, y, color, Math.min(size, 6));
        }

