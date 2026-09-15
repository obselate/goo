package GooGallery

class World3DState {
    internal let MapRows[16]uint32
    internal let EnemyX[6]float64
    internal let EnemyY[6]float64
    internal let EnemyAttackTimer[6]float64
    internal var CameraX float64
    internal var CameraY float64
    internal var CameraAngle float64
    internal var Health float64
    internal var Ammo int32
    internal var ReserveAmmo int32
    internal var DefeatedMask int32
    internal var Score int32
    internal var ReloadTimer float64
    internal var FireCooldown float64
    internal var DamageFlash float64
    internal var MuzzleTimer float64
    internal var HitFlash float64
    internal var DryFlash float64
    internal var Dead bool
    internal var Won bool
    internal var Elapsed float64

    public init() {
        MapRows = [16]uint32{
            0xFFFFu,
            0x8001u,
            0x8811u,
            0x8001u,
            0xFF7Fu,
            0x8001u,
            0x8811u,
            0x8001u,
            0xEFF7u,
            0x8001u,
            0x8811u,
            0x8001u,
            0xFF7Fu,
            0x8001u,
            0x8811u,
            0xFFFFu,
        }
        EnemyX = [6]float64{5.5, 10.5, 2.5, 7.5, 10.5, 2.5}
        EnemyY = [6]float64{1.5, 1.5, 3.5, 4.5, 7.5, 10.5}
        EnemyAttackTimer = [6]float64{0.2, 0.6, 0.8, 0.4, 1.0, 0.7}
        Reset()
    }

    internal func Reset() {
        CameraX = 2.5
        CameraY = 1.5
        CameraAngle = 0.0
        Health = 100.0
        Ammo = 6
        ReserveAmmo = 24
        DefeatedMask = 0
        Score = 0
        ReloadTimer = 0.0
        FireCooldown = 0.0
        DamageFlash = 0.0
        MuzzleTimer = 0.0
        HitFlash = 0.0
        DryFlash = 0.0
        Dead = false
        Won = false
        Elapsed = 0.0
        EnemyX[0] = 5.5
        EnemyX[1] = 10.5
        EnemyX[2] = 2.5
        EnemyX[3] = 7.5
        EnemyX[4] = 10.5
        EnemyX[5] = 2.5
        EnemyY[0] = 1.5
        EnemyY[1] = 1.5
        EnemyY[2] = 3.5
        EnemyY[3] = 4.5
        EnemyY[4] = 7.5
        EnemyY[5] = 10.5
        EnemyAttackTimer[0] = 0.2
        EnemyAttackTimer[1] = 0.6
        EnemyAttackTimer[2] = 0.8
        EnemyAttackTimer[3] = 0.4
        EnemyAttackTimer[4] = 1.0
        EnemyAttackTimer[5] = 0.7
    }

    internal func IsDefeated(index int32) bool -> (DefeatedMask & (1 << index)) != 0

    internal func ActiveEnemyCount() int32 {
        var count int32 = 0
        var index int32 = 0
        while index < 6 {
            if !IsDefeated(index) {
                count = count + 1
            }
            index = index + 1
        }
        return count
    }

    internal func IsTerminal() bool -> Dead || Won
}
