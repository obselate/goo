package Goo

import System
import System.Collections.Generic

/// Describes output-device enumeration on the current platform.
public enum SoundDeviceStatus {
    Enumerated,
    Unsupported,
    SubsystemUnavailable,
    NativeFailure
}

/// Identifies one connected output within an undisposed device list.
public class SoundOutputDevice {
    internal let Owner SoundOutputDevices
    internal let Id uint32

    internal init(owner SoundOutputDevices, id uint32, name string) {
        Owner = owner
        Id = id
        Name = name
    }

    /// Gets the platform display name. Different outputs can have the same name.
    public prop Name string {
        get;
        private set;
    }
}

/// Owns an output snapshot and its SDL subsystem reference. Dispose on the UI thread.
/// Open a chosen device before disposing this list. Open players keep their own device reference.
public class SoundOutputDevices : IDisposable {
    internal var Disposed bool
    internal let Initialized bool

    internal init(status SoundDeviceStatus, devices([]SoundOutputDevice)? = nil, initialized bool = false) {
        Status = status
        Devices = Array.AsReadOnly[SoundOutputDevice](devices ?? Array.Empty[SoundOutputDevice]())
        Initialized = initialized
    }

    /// Gets the enumeration outcome. Only Enumerated can carry devices.
    public prop Status SoundDeviceStatus {
        get;
        private set;
    }

    /// Gets the output snapshot. Device entries cannot be retained for opening after this list is disposed.
    public prop Devices IReadOnlyList[SoundOutputDevice] {
        get;
        private set;
    }

    /// Releases this snapshot's native subsystem reference. Existing players are not stopped.
    public func Dispose() -> SoundRuntime.ReleaseOutputs(this)
}
