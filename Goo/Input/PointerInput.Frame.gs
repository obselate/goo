package Goo

internal partial class PointerInput {
    private var motionFrameVersion int64
    private var activeMotionFrame int64
    private var motionResetVersion int64

    internal func DispatchFrame(samples []QueuedPointerEvent, count int32, root Node?, resolver Resolver,
        timeS float64, text TextInput) bool {
        let previous = activeMotionFrame
        let resetVersion = motionResetVersion
        motionFrameVersion++
        activeMotionFrame = motionFrameVersion
        try {
            for i in 0 ... count {
                let sample = samples[i]
                if sample.Device != PointerDevice.Touch { continue }
                if let group = gestureGroupFor(sample.PointerId) {
                    for contact in group.Contacts {
                        if contact.Id == sample.PointerId {
                            contact.X = sample.X
                            contact.Y = sample.Y
                            break
                        }
                    }
                }
            }
            var changed = false
            for i in 0 ... count {
                if motionResetVersion != resetVersion { break }
                if Dispatch(samples[i], root, resolver, timeS, text) { changed = true }
            }
            return changed
        } finally { activeMotionFrame = previous }
    }
}
