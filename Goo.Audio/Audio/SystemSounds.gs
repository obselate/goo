package Goo

import System

/// Identifies a platform UI sound, not an application audio cue.
public enum SystemSound {
    Click,
    Alert
}

/// Describes whether the platform accepted a system sound request.
public enum SystemSoundStatus {
    Queued,
    Unsupported,
    NativeFailure
}

/// Plays optional UI feedback through platform sound APIs without opening a SoundPlayer.
public class SystemSounds {
    private init() {}

    shared {
        /// Requests a platform click or alert. Queued does not guarantee audible output.
        /// Android and unavailable platform APIs return Unsupported. Invalid sound values throw.
        public func TryPlay(sound SystemSound) SystemSoundStatus {
            if sound != SystemSound.Click && sound != SystemSound.Alert {
                throw ArgumentOutOfRangeException("sound")
            }
            return SystemSoundRuntime.Play(sound)
        }
    }
}
