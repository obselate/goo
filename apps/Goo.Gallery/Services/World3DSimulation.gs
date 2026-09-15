package GooGallery

import System

class World3DSimulation {
    private let state World3DState

    public init(state World3DState) {
        this.state = state
    }

    internal func Step(dt float64, forward float64, strafe float64) {
        let boundedDt = Math.Clamp(dt, 0.0, 0.1)
        state.Elapsed = state.Elapsed + boundedDt
        state.FireCooldown = Math.Max(state.FireCooldown - boundedDt, 0.0)
        state.DamageFlash = Math.Max(state.DamageFlash - boundedDt * 2.8, 0.0)
        state.MuzzleTimer = Math.Max(state.MuzzleTimer - boundedDt * 7.0, 0.0)
        state.HitFlash = Math.Max(state.HitFlash - boundedDt * 3.0, 0.0)
        state.DryFlash = Math.Max(state.DryFlash - boundedDt * 4.0, 0.0)
        if state.IsTerminal() {
            return
        }
        updateReload(boundedDt)
        if state.ReloadTimer <= 0.0 {
            movePlayer(boundedDt, forward, strafe)
            moveEnemies(boundedDt)
            updateThreats(boundedDt)
        }
        if state.Health <= 0.0 {
            state.Health = 0.0
            state.Dead = true
        }
    }

    internal func TryFire() bool {
        state.HitFlash = 0.0
        state.DryFlash = 0.0
        if state.IsTerminal() || state.ReloadTimer > 0.0 || state.FireCooldown > 0.0 {
            return false
        }
        if state.Ammo <= 0 {
            state.DryFlash = 1.0
            Reload()
            return false
        }
        state.Ammo = state.Ammo - 1
        state.FireCooldown = 0.22
        state.MuzzleTimer = 0.13
        let target = aimTarget()
        if target >= 0 {
            state.DefeatedMask = state.DefeatedMask | (1 << target)
            state.Score = state.Score + 100
            state.HitFlash = 1.0
            if state.ActiveEnemyCount() == 0 {
                state.Won = true
            }
        }
        return true
    }

    internal func Reload() {
        if state.IsTerminal() || state.ReloadTimer > 0.0
        || state.Ammo >= 6 || state.ReserveAmmo <= 0 {
            return
        }
        state.ReloadTimer = 1.15
    }

    internal func Reset() {
        state.Reset()
    }

    private func isWall(x int32, y int32) bool {
        if x < 0 || y < 0 || x >= 16 || y >= 16 {
            return true
        }
        let bit = uint32(1) << x
        return (state.MapRows[y] & bit) != 0u
    }

    private func canOccupy(x float64, y float64, radius float64, ignoredEnemy int32) bool {
        let centerX = int32(Math.Floor(x))
        let centerY = int32(Math.Floor(y))
        let leftX = int32(Math.Floor(x - radius))
        let rightX = int32(Math.Floor(x + radius))
        let topY = int32(Math.Floor(y - radius))
        let bottomY = int32(Math.Floor(y + radius))
        if isWall(centerX, centerY)
        || isWall(leftX, centerY) || isWall(rightX, centerY)
        || isWall(centerX, topY) || isWall(centerX, bottomY)
        || isWall(leftX, topY) || isWall(rightX, topY)
        || isWall(leftX, bottomY) || isWall(rightX, bottomY) {
            return false
        }
        var index int32 = 0
        while index < 6 {
            if index != ignoredEnemy && !state.IsDefeated(index) {
                let dx = state.EnemyX[index] - x
                let dy = state.EnemyY[index] - y
                if dx * dx + dy * dy < (radius + 0.30) * (radius + 0.30) {
                    return false
                }
            }
            index = index + 1
        }
        return true
    }

    private func wallDistance(originX float64, originY float64, directionX float64, directionY float64) float64 {
        var mapX = int32(Math.Floor(originX))
        var mapY = int32(Math.Floor(originY))
        let deltaX = 1.0 / Math.Max(Math.Abs(directionX), 0.0001)
        let deltaY = 1.0 / Math.Max(Math.Abs(directionY), 0.0001)
        let stepX = if directionX < 0.0 {
            -1
        } else {
            1
        }
        let stepY = if directionY < 0.0 {
            -1
        } else {
            1
        }
        var sideX = if directionX < 0.0 {
            (originX - float64(mapX)) * deltaX
        } else {
            (float64(mapX) + 1.0 - originX) * deltaX
        }
        var sideY = if directionY < 0.0 {
            (originY - float64(mapY)) * deltaY
        } else {
            (float64(mapY) + 1.0 - originY) * deltaY
        }
        var side int32 = 0
        var iteration int32 = 0
        while iteration < 56 {
            if sideX < sideY {
                sideX = sideX + deltaX
                mapX = mapX + stepX
                side = 0
            } else {
                sideY = sideY + deltaY
                mapY = mapY + stepY
                side = 1
            }
            if isWall(mapX, mapY) {
                if side == 0 {
                    let wallX = float64(mapX) - originX + (1.0 - float64(stepX)) * 0.5
                    return Math.Max(wallX / directionX, 0.001)
                }
                let wallY = float64(mapY) - originY + (1.0 - float64(stepY)) * 0.5
                return Math.Max(wallY / directionY, 0.001)
            }
            iteration = iteration + 1
        }
        return 64.0
    }

    private func hasLineOfSight(originX float64, originY float64, targetX float64, targetY float64) bool {
        let deltaX = targetX - originX
        let deltaY = targetY - originY
        let targetDistance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY)
        let directionX = deltaX / Math.Max(targetDistance, 0.0001)
        let directionY = deltaY / Math.Max(targetDistance, 0.0001)
        return wallDistance(originX, originY, directionX, directionY) >= targetDistance - 0.08
    }

    private func movePlayer(dt float64, forward float64, strafe float64) {
        let directionX = Math.Cos(state.CameraAngle)
        let directionY = Math.Sin(state.CameraAngle)
        let strafeX = directionY
        let strafeY = -directionX
        let moveX = directionX * forward + strafeX * strafe
        let moveY = directionY * forward + strafeY * strafe
        let moveLength = Math.Sqrt(moveX * moveX + moveY * moveY)
        if moveLength <= 0.000001 {
            return
        }
        let speed = 2.35 * dt / moveLength
        let nextX = state.CameraX + moveX * speed
        let nextY = state.CameraY + moveY * speed
        if canOccupy(nextX, state.CameraY, 0.20, -1) {
            state.CameraX = nextX
        }
        if canOccupy(state.CameraX, nextY, 0.20, -1) {
            state.CameraY = nextY
        }
    }

    private func moveEnemies(dt float64) {
        var index int32 = 0
        while index < 6 {
            if !state.IsDefeated(index) {
                let deltaX = state.CameraX - state.EnemyX[index]
                let deltaY = state.CameraY - state.EnemyY[index]
                let distance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY)
                if distance > 1.75 {
                    let directionX = deltaX / Math.Max(distance, 0.0001)
                    let directionY = deltaY / Math.Max(distance, 0.0001)
                    let speed = 0.18 + float64(index % 3) * 0.035
                    let stride = speed * dt
                    let nextX = state.EnemyX[index] + directionX * stride
                    let nextY = state.EnemyY[index] + directionY * stride
                    if canOccupy(nextX, state.EnemyY[index], 0.26, index) {
                        state.EnemyX[index] = nextX
                    }
                    if canOccupy(state.EnemyX[index], nextY, 0.26, index) {
                        state.EnemyY[index] = nextY
                    }
                    if distance > 2.4 && !canOccupy(nextX, nextY, 0.26, index) {
                        let side = if index % 2 == 0 {
                            1.0
                        } else {
                            -1.0
                        }
                        let sidestepX = -directionY * side * stride
                        let sidestepY = directionX * side * stride
                        let slideX = state.EnemyX[index] + sidestepX
                        let slideY = state.EnemyY[index] + sidestepY
                        if canOccupy(slideX, state.EnemyY[index], 0.26, index) {
                            state.EnemyX[index] = slideX
                        }
                        if canOccupy(state.EnemyX[index], slideY, 0.26, index) {
                            state.EnemyY[index] = slideY
                        }
                    }
                }
            }
            index = index + 1
        }
    }

    private func updateThreats(dt float64) {
        var index int32 = 0
        while index < 6 {
            if !state.IsDefeated(index) {
                let deltaX = state.CameraX - state.EnemyX[index]
                let deltaY = state.CameraY - state.EnemyY[index]
                let distance = Math.Sqrt(deltaX * deltaX + deltaY * deltaY)
                if distance < 4.6 &&
                    hasLineOfSight(state.EnemyX[index], state.EnemyY[index], state.CameraX, state.CameraY) {
                    state.EnemyAttackTimer[index] = state.EnemyAttackTimer[index] - dt
                    if state.EnemyAttackTimer[index] <= 0.0 {
                        state.Health = state.Health - (5.0 + float64(index % 3) * 2.0)
                        state.DamageFlash = 1.0
                        state.EnemyAttackTimer[index] = 0.85 + float64(index % 4) * 0.18
                    }
                } else {
                    state.EnemyAttackTimer[index] = Math.Min(state.EnemyAttackTimer[index] + dt * 0.25, 1.0)
                }
            }
            index = index + 1
        }
    }

    private func updateReload(dt float64) {
        if state.ReloadTimer <= 0.0 {
            return
        }
        state.ReloadTimer = state.ReloadTimer - dt
        if state.ReloadTimer > 0.0 {
            return
        }
        let required = 6 - state.Ammo
        let transfer = Math.Min(required, state.ReserveAmmo)
        state.Ammo = state.Ammo + int32(transfer)
        state.ReserveAmmo = state.ReserveAmmo - int32(transfer)
        state.ReloadTimer = 0.0
    }

    private func aimTarget() int32 {
        let directionX = Math.Cos(state.CameraAngle)
        let directionY = Math.Sin(state.CameraAngle)
        let planeX = -directionY
        let planeY = directionX
        var best = wallDistance(state.CameraX, state.CameraY, directionX, directionY)
        var target int32 = -1
        var index int32 = 0
        while index < 6 {
            if !state.IsDefeated(index) {
                let relativeX = state.EnemyX[index] - state.CameraX
                let relativeY = state.EnemyY[index] - state.CameraY
                let depth = relativeX * directionX + relativeY * directionY
                let lateral = Math.Abs(relativeX * planeX + relativeY * planeY)
                if depth > 0.15 && depth < best && lateral < 0.22 + depth * 0.012 {
                    target = index
                    best = depth
                }
            }
            index = index + 1
        }
        return target
    }
}
